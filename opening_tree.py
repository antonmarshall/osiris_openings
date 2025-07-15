import logging
import chess
import chess.pgn
import os
from collections import defaultdict, deque
from typing import Dict, Any, Optional, List, Set, Tuple, DefaultDict
import uuid

logger = logging.getLogger(__name__)

# Helper to create a unique FEN key without en passant, castling, halfmove, fullmove
def get_fen_key(board: chess.Board) -> str:
    return board.fen().split(' ')[0] # Only piece placement

class Node:
    """
    Knoten im Eröffnungsbaum, der eine Schachstellung und Statistiken repräsentiert.
    """
    __slots__ = ("id", "fen", "games", "wins", "draws", "losses", "children", "games_info", "move_counts", "elo_diff_sum", "elo_diff_count", "move_dates", "move_san", "parent_fen", "parent_id", "source_files", "is_in_repertoire", "studied", "study_session", "directly_learned_sessions")
    
    def __init__(self, fen: str, move_san: Optional[str] = None, parent_fen: Optional[str] = None, parent_id: Optional[str] = None, is_in_repertoire: bool = True):
        self.id = str(uuid.uuid4())
        self.fen = fen
        self.move_san = move_san
        self.parent_fen = parent_fen
        self.parent_id = parent_id
        self.children: Dict[str, Node] = {}
        self.games = 0
        self.wins = 0
        self.draws = 0
        self.losses = 0
        self.games_info: List[Dict[str, Any]] = []
        self.move_counts: Dict[str, int] = {}
        self.elo_diff_sum: Dict[str, int] = {}
        self.elo_diff_count: Dict[str, int] = {}
        self.move_dates: Dict[str, List[str]] = {}
        self.source_files: Set[str] = set()
        self.is_in_repertoire = is_in_repertoire
        # Learning status tracking
        self.studied = False
        self.study_session = None
        # --- NEU: Direkt gelernt pro Session ---
        self.directly_learned_sessions: Set[str] = set()

    def add_child(self, move_uci: str, child_node: 'Node'):
        self.children[move_uci] = child_node

    def increment_game_stats(self, result_for_player: str, game_details: Dict[str, Any], skip_stats: bool = False, own_repertoir: bool = False):
        if own_repertoir:
            # Für eigenes Repertoire: neutrale Werte setzen
            self.games = 1  # Immer 1 für Repertoire-Züge
            self.wins = 0   # Neutral
            self.draws = 0  # Neutral
            self.losses = 0 # Neutral
            self.games_info = []  # Leer für Repertoire
        else:
            # Normale Statistik-Logik für Analyse-Spieler
            self.games += 1 # This counts games reaching this position.
              # Game-specific outcome stats (wins/draws/losses for the player) are updated based on result_for_player
            if not skip_stats:
                if result_for_player == '1':
                    self.wins += 1
                elif result_for_player == '0':
                    self.losses += 1
                elif result_for_player == '1/2':
                    self.draws += 1
            self.games_info.append(game_details) # Store details of the game that led to this state

    # ====================================================================
    # LEARNING STATUS METHODS
    # ====================================================================
    
    def mark_as_studied(self, session_id: str):
        """Mark this node as studied in current session"""
        self.studied = True
        self.study_session = session_id
        logger.info(f"[LEARNING] Node {self.id[:8]} marked as studied in session {session_id[:8]}")

    def is_studied(self, session_id: str) -> bool:
        """Check if node is studied in current session"""
        return self.studied and self.study_session == session_id

    def get_unstudied_children(self, session_id: str) -> List['Node']:
        """Get children that are not yet studied"""
        return [child for child in self.children.values() 
                if not child.is_studied(session_id)]

    def should_be_studied(self, session_id: str) -> bool:
        """Check if all children are studied (recursive)"""
        if not self.children:  # Leaf node - always should be studied
            return True
        return all(child.is_studied(session_id) for child in self.children.values())

    def get_win_rate(self) -> float:
        # Total games where an outcome (win, loss, draw) was recorded for win rate calculation
        countable_games = self.wins + self.losses + self.draws
        if countable_games == 0:
            # If only '*' games passed through or no games, win rate is undefined or 0.
            # Or, if self.games > 0 but all were skip_stats=True, then countable_games is 0.
            # A common convention is 50% if only draws, but here we use decisive games.
            return 0.0 
        return ((self.wins + 0.5 * self.draws) / countable_games) * 100

    def get_move_color(self, is_repertoire: bool = False) -> str:
        """
        Calculate the color for this move based on performance statistics.
        For repertoire moves, returns green. For regular games, maps win rate to color gradient.
        """
        if is_repertoire:
            return "#4caf50"  # Green for repertoire moves
        
        win_rate = self.get_win_rate()
        countable_games = self.wins + self.losses + self.draws
        
        # If no statistical data, use neutral gray
        if countable_games == 0:
            return "#9e9e9e"  # Gray for no data
        
        # Map win rate to color gradient from red to yellow to green
        if win_rate >= 65:
            return "#4caf50"    # Green for excellent (65%+)
        elif win_rate >= 55:
            return "#8bc34a"    # Light green for good (55-64%)
        elif win_rate >= 45:
            return "#ffeb3b"    # Yellow for average (45-54%)
        elif win_rate >= 35:
            return "#ff9800"    # Orange for below average (35-44%)
        else:
            return "#f44336"    # Red for poor (below 35%)
    
    def to_dict(self, perspective_color_str: str, include_children: bool = True, max_depth: int = 20, current_depth: int = 0, is_repertoire: bool = False, session_id: Optional[str] = None) -> Dict[str, Any]:
        win_rate = self.get_win_rate()
        color = self.get_move_color(is_repertoire)
        result = {
            'id': self.id,
            'fen': self.fen,
            'move_san': self.move_san, # The move (SAN) that led to this FEN from parent
            'parent_fen': self.parent_fen,
            'parent_id': self.parent_id,
            'games': self.games, # Total games reaching this FEN
            'wins': self.wins,   # Wins for the analyzed player from this FEN onwards (if this node is a terminal state for a game) or leading to this state
            'draws': self.draws,
            'losses': self.losses,
            'win_rate': round(win_rate, 2),
            'color': color,
            'is_in_repertoire': self.is_in_repertoire,  # <--- NEU: Immer mitsenden
            'game_info': self.games_info[:10], # Limit game_info for brevity
        }
        # --- Logging für Debug: ---
        logger.info(f"[to_dict] move_san={self.move_san} color={color} is_in_repertoire={self.is_in_repertoire} games={self.games}")
        
        # Add learning status if session_id is provided
        if session_id is not None:
            result['studied'] = self.is_studied(session_id)
            result['should_be_studied'] = self.should_be_studied(session_id)
        # Only include children if requested, within depth limit, and we have children
        if include_children and current_depth < max_depth and self.children:
            result['children'] = {uci: child.to_dict(
                perspective_color_str, 
                include_children, 
                max_depth, 
                current_depth + 1, 
                is_repertoire
            ) for uci, child in self.children.items() if child.games > 0}
        else:
            result['children'] = {}
        return result

    # --- NEU: Direkt gelernt-Logik ---
    def mark_as_directly_learned(self, session_id: str):
        self.directly_learned_sessions.add(session_id)
    
    def unmark_as_directly_learned(self, session_id: str):
        self.directly_learned_sessions.discard(session_id)
    
    def is_directly_learned(self, session_id: str) -> bool:
        return session_id in self.directly_learned_sessions

class OpeningTree:
    """
    Analysiert PGN-Dateien eines Spielers und baut einen Baum der Eröffnungen
    (Stellungen und Züge mit statistischen Erfolgsdaten).
    """
    def __init__(self, player_name: Optional[str] = None, initial_perspective_color: str = 'white', own_repertoir: bool = False):
        self.root_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        self.player_name = player_name
        self.current_perspective_color = initial_perspective_color.lower()
        self.own_repertoir = own_repertoir
        self.nodes: Dict[str, Node] = {}  # key: node.id
        self.nodes_by_fen: Dict[str, Node] = {}  # key: normalized fen
        
        root_node_obj = Node(self.root_fen)
        self.nodes[root_node_obj.id] = root_node_obj
        self.nodes_by_fen[self._get_node_key(self.root_fen)] = root_node_obj
        
        self.processed_files: Set[str] = set()
        self.player_color_map: Dict[str, str] = {} 
        self.tree_dict: Dict[str, Dict[str, Any]] = {}
        
        logger.info(f"OpeningTree initialized for player: {self.player_name}, perspective: {self.current_perspective_color}. Root FEN: {self.root_fen}")
        # --- NEW: Log all children of root node after init ---
        self.log_root_children("__init__ after tree creation")
        # --- NEU: Fehlerzähler pro Session ---
        self.mistake_count_per_session: DefaultDict[str, int] = defaultdict(int)

    def log_root_children(self, context=""):
        root = self.nodes_by_fen.get(self._get_node_key(self.root_fen))
        if root:
            logger.info(f"[DEBUG] Root children after {context}:")
            for uci, child in root.children.items():
                logger.info(f"    move_san={child.move_san}, uci={uci}, games={child.games}")
        else:
            logger.info(f"[DEBUG] No root node found after {context}")

    def _get_node_key(self, fen: str) -> str:
        """
        Creates a key for the node dictionary by using the FEN without half/full move counts.
        This allows for transpositions to be treated as the same node.
        """
        try:
            # Key consists of piece placement, active color, castling availability, and en-passant square.
            return ' '.join(fen.split(' ')[:4])
        except Exception as e:
            logger.error(f"Error creating node key for FEN '{fen}': {e}")
            # Fallback to the original FEN if splitting fails
            return fen

    def _create_node_data(self, fen: str, games: int, wins: int, draws: int, losses: int,
                          children: Dict[str, str], move_san: Optional[str], game_info_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        # This method was for creating dictionary nodes.
        # It's kept for reference but Node objects are now primary.
        children_data = children if children is not None else {}
        game_info_list_data = game_info_list if game_info_list is not None else []
        
        countable_games = wins + losses + draws
        win_rate = 0.0
        if countable_games > 0:
            win_rate = ((wins + 0.5 * draws) / countable_games) * 100
        
        return {            'fen': fen,
            'games': games,
            'wins': wins,
            'draws': draws,
            'losses': losses,
            'win_rate': round(win_rate, 2),
            'children': children_data, # This would be Dict[str, Dict] if recursive
            'move_san': move_san,
            'game_info': game_info_list_data
        }

    def _get_player_perspective_color_and_result(self, headers: chess.pgn.Headers, current_player_name: str, perspective_color_str: str) -> Tuple[Optional[str], Optional[str], bool, Optional[str], Optional[str]]:
        # This method remains a utility to determine game relevance and player's result.
        # It's called from app.py before adding a game to the tree.
        white_player = headers.get("White", "").strip()
        black_player = headers.get("Black", "").strip()
        game_result = headers.get("Result", "*")
        skip_stats = False  # Accept all games, including those with '*' result

        player_actual_color_in_game: Optional[str] = None
        result_for_player: Optional[str] = None
        
        # Normalize player names for more flexible matching
        normalized_current_player_name = current_player_name.lower() if current_player_name else ""
        
        # Create alternative formats for flexible matching
        # Convert "Hikaru_Nakamura" to "nakamura hikaru" and vice versa
        def create_name_variants(name):
            variants = [name]
            if '_' in name:
                variants.append(name.replace('_', ' '))
                # Also try swapping first/last name: "Hikaru_Nakamura" -> "nakamura hikaru"
                parts = name.split('_')
                if len(parts) == 2:
                    variants.append(f"{parts[1]} {parts[0]}")
            elif ' ' in name:
                variants.append(name.replace(' ', '_'))
                # Also try swapping first/last name: "Nakamura Hikaru" -> "hikaru nakamura"
                parts = name.split(' ')
                if len(parts) == 2:
                    variants.append(f"{parts[1]} {parts[0]}")
                    variants.append(f"{parts[1]}_{parts[0]}")
            return variants
        
        current_player_variants = create_name_variants(normalized_current_player_name)
        
        def name_matches(player_variants, target_name):
            target_lower = target_name.lower()
            for variant in player_variants:
                if variant in target_lower or target_lower in variant:
                    return True
            return False        # Check if player name is present and not empty
        if not normalized_current_player_name:
            logger.debug(f"[OpeningTree._get_player_perspective] No current_player_name provided. Skipping game.")
            return None, None, True, None, "Kein Spielername angegeben" # Skip if no player context
        
        # REPERTOIRE LOGIC: Für Repertoire-Spieler (white_repertoir/black_repertoir) 
        # müssen ALLE Züge akzeptiert werden, da sie beide Farben enthalten
        if current_player_name in ["white_repertoir", "black_repertoir"]:
            # Bei Repertoire: Player steht IMMER als Weiß in der PGN (siehe add_opening_lines.py)
            # Aber das Repertoire enthält Züge für BEIDE Farben aus EINER Perspektive
            if name_matches(current_player_variants, white_player):
                # Repertoire-Spiel gefunden - aber welche Farbe hat der aktuelle Zug?
                # Das bestimmt sich durch die Board-Position, nicht durch PGN-Header
                # Für Repertoire: Immer als "white" behandeln (Repertoire-Perspektive)
                player_actual_color_in_game = 'white'  # Repertoire-Perspektive
                result_for_player = '*'  # Repertoire hat keine Ergebnisse
                skip_stats = True  # Keine Statistiken für Repertoire
                logger.debug(f"[OpeningTree._get_player_perspective] REPERTOIRE: Player {current_player_name} found in game. Processing as repertoire.")
                return player_actual_color_in_game, result_for_player, skip_stats, player_actual_color_in_game, None
            else:                # Repertoire-Player nicht in dieser PGN gefunden
                logger.debug(f"[OpeningTree._get_player_perspective] REPERTOIRE: Player {current_player_name} not found in game headers. Skipping.")
                return None, None, True, None, f"Repertoire-Spieler '{current_player_name}' nicht in PGN gefunden (W: '{white_player}', B: '{black_player}')"
        
        # NORMALE ANALYSE-LOGIK: Für echte Spieler (Magnus_Carlsen, etc.)
        is_white_perspective = perspective_color_str.lower() == 'white'
        if is_white_perspective:
            # Player is looking for their White games
            if name_matches(current_player_variants, white_player):
                player_actual_color_in_game = 'white'
                if game_result == "1-0": result_for_player = '1'
                elif game_result == "0-1": result_for_player = '0'
                elif game_result in ["1/2-1/2", "½-½"]: result_for_player = '1/2'
                else: result_for_player = '*' # Unknown/Ongoing, handled by skip_stats
            else: # Player is not White in this game
                return None, None, True, None, f"Spieler '{current_player_name}' sucht Weiß-Partien, aber spielt nicht Weiß (W: '{white_player}', B: '{black_player}')"
        else: # Player is looking for their Black games
            if name_matches(current_player_variants, black_player):
                player_actual_color_in_game = 'black'
                if game_result == "0-1": result_for_player = '1'
                elif game_result == "1-0": result_for_player = '0'
                elif game_result in ["1/2-1/2", "½-½"]: result_for_player = '1/2'
                else: result_for_player = '*'
            else: # Player is not Black in this game
                return None, None, True, None, f"Spieler '{current_player_name}' sucht Schwarz-Partien, aber spielt nicht Schwarz (W: '{white_player}', B: '{black_player}')"

        if player_actual_color_in_game is None:
             # This case should be covered by the returns above if player not found for the perspective
             logger.debug(f"[OpeningTree._get_player_perspective] Player {current_player_name} (perspective {perspective_color_str}) not found as White ('{white_player}') or Black ('{black_player}'). Game Result: {game_result}. Skipping.")
             return None, None, True, None, f"Spieler '{current_player_name}' in unbekanntem Zustand nicht gefunden"

        logger.debug(f"[OpeningTree._get_player_perspective] Player: {current_player_name}, Perspective: {perspective_color_str}, Actual Color in Game: {player_actual_color_in_game}, Game Result: {game_result}, Result for Player: {result_for_player}, Skip Stats: {skip_stats}")        
        return player_actual_color_in_game, result_for_player, skip_stats, player_actual_color_in_game, None

    def add_game_to_tree(self, pgn_game: chess.pgn.Game, pgn_file_path: str,
                         player_actual_color_in_game: str, result_for_player: str, 
                         skip_stats: bool, game_details: Dict[str, Any],
                         white_elo: int, black_elo: int):
        """
        Adds a single processed game to the opening tree.
        The game is processed from the perspective of self.player_name playing with self.current_perspective_color.
        player_actual_color_in_game, result_for_player, skip_stats are pre-determined by _get_player_perspective_color_and_result.
        """
        
        # Determine player's ELO and opponent's ELO for this game
        player_elo_for_game = black_elo
        opponent_elo_for_game = white_elo

        # --- CORE LOGIC FIX ---
        # 1. Start from the board position defined in the PGN (respects FEN headers)
        game_board = pgn_game.board()

        # Find the starting node in our tree. It must exist.
        start_node_key = self._get_node_key(game_board.fen())
        current_node_in_tree = self.nodes_by_fen.get(start_node_key)
        
        if current_node_in_tree is None:
            # This can happen if a PGN starts from a position not yet in the tree
            # or if the root FEN itself is non-standard.
            logger.warning(f"Game in {pgn_file_path} starts from a FEN not in tree: {game_board.fen()}. Skipping.")
            return

        # 2. Iterate through the game, using the game object to handle board state
        for move in pgn_game.mainline_moves():
            parent_node_in_tree = current_node_in_tree
            move_uci = move.uci()
            
            # The board is updated by the iteration, so we get the SAN before pushing
            move_san = game_board.san(move)
            game_board.push(move) # This advances the game_board's internal state

            # 3. Use the new, correct board state to create/find nodes
            full_fen_after_move = game_board.fen()
            node_key = self._get_node_key(full_fen_after_move)

            child_node_obj = self.nodes_by_fen.get(node_key)
            if child_node_obj is None:
                # Determine if the move is in repertoire based on the current game's perspective
                # This logic needs to be more sophisticated if repertoire is handled per game
                # For now, assume if the current game is a repertoire game, all moves are repertoire
                is_in_repertoire = self.own_repertoir or (player_actual_color_in_game == 'white' and current_node_in_tree.is_in_repertoire) or (player_actual_color_in_game == 'black' and not current_node_in_tree.is_in_repertoire)
                child_node_obj = Node(full_fen_after_move, move_san=move_san, parent_fen=parent_node_in_tree.fen, parent_id=parent_node_in_tree.id, is_in_repertoire=is_in_repertoire)
                self.nodes[child_node_obj.id] = child_node_obj
                self.nodes_by_fen[node_key] = child_node_obj
                logger.info(f"[NODE CREATE] move={move_san} parent={parent_node_in_tree.id[:8]} id={child_node_obj.id[:8]} games={child_node_obj.games} context=add_game_to_tree")
            
            parent_node_in_tree.add_child(move_uci, child_node_obj)
            child_node_obj.increment_game_stats(result_for_player, game_details, skip_stats, self.own_repertoir)
            
            # Track source file for this node
            child_node_obj.source_files.add(pgn_file_path)
            
            # Update stats on the parent node for the move made
            parent_node_in_tree.move_counts[move_uci] = parent_node_in_tree.move_counts.get(move_uci, 0) + 1
            if not skip_stats:
                parent_node_in_tree.elo_diff_sum[move_uci] = parent_node_in_tree.elo_diff_sum.get(move_uci, 0) + (player_elo_for_game - opponent_elo_for_game)
                parent_node_in_tree.elo_diff_count[move_uci] = parent_node_in_tree.elo_diff_count.get(move_uci, 0) + 1
                parent_node_in_tree.move_dates.setdefault(move_uci, []).append(game_details.get("Datum", "?"))

            # Set the current node for the next iteration
            current_node_in_tree = child_node_obj
        
        # Mark PGN file as processed for this tree instance if needed
        self.processed_files.add(pgn_file_path)
        # At the end of PGN loading, log root children
        self.log_root_children(f"add_game_to_tree from {pgn_file_path}")

    def get_tree_data(self, fen: str, perspective_color_str: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Retrieves the dictionary representation of a node and its children.
        Perspective color string determines how win rates are interpreted if they were neutral.
        (Here, stats are already from player's perspective).
        """
        node_key = self._get_node_key(fen)
        node_obj = self.nodes_by_fen.get(node_key)
        
        if node_obj:
            # Use the tree's current perspective if none is provided for display
            display_perspective = perspective_color_str or self.current_perspective_color
            return node_obj.to_dict(
                display_perspective, 
                include_children=True, 
                max_depth=10, 
                is_repertoire=self.own_repertoir
            )
        logger.warning(f"🔍 Node not found for FEN: {fen[:50]}... (key: {node_key}) in get_tree_data")
        return None

    def get_moves_from_position(self, fen: str, perspective_color_str: Optional[str] = None) -> Dict[str, Any]:
        """
        Returns data for the given FEN and all direct child moves.
        Uses the same filtering logic as to_dict() for consistency.
        """
        node_key = self._get_node_key(fen)
        current_node_obj = self.nodes_by_fen.get(node_key)
        display_perspective = perspective_color_str or self.current_perspective_color

        if not current_node_obj:
            logger.warning(f"🔍 Node not found for FEN: {fen[:50]}... (key: {node_key}) in get_moves_from_position")
            return {"fen": fen, "error": "Position not found in tree", "moves": [], "node_stats": {}}

        # DEBUG: Log tree context
        logger.info(f"🔍 TREE CONTEXT: player={self.player_name} | perspective={display_perspective} | "
                   f"own_repertoir={self.own_repertoir} | children_count={len(current_node_obj.children)}")

        # Get node data using the same logic as to_dict()
        node_data = current_node_obj.to_dict(display_perspective, include_children=False, max_depth=1)
        
        # Get filtered children using the same logic as to_dict()
        filtered_children = {uci: child for uci, child in current_node_obj.children.items() if child.games > 0}
        
        moves_data = []
        board_at_fen = chess.Board(current_node_obj.fen)
        
        # Pre-calculate game counts for thickness calculation (only from filtered children)
        game_counts = [child_node_obj.games for child_node_obj in filtered_children.values()]
        max_games = max(game_counts) if game_counts else 1
        min_games = min(game_counts) if game_counts else 0

        for move_uci, child_node_obj in filtered_children.items():
            try:
                move = board_at_fen.parse_uci(move_uci)
                move_san = board_at_fen.san(move)
            except ValueError:
                logger.error(f"Could not parse UCI move '{move_uci}' from FEN '{fen}'. Using UCI as SAN.")
                move_san = move_uci

            child_stats = child_node_obj.to_dict(
                display_perspective, 
                include_children=False, 
                is_repertoire=self.own_repertoir
            )
            # --- Logging für Debug: ---
            logger.info(f"[get_moves_from_position] move_san={move_san} color={child_stats.get('color')} is_in_repertoire={child_stats.get('is_in_repertoire')} games={child_stats.get('games')}")
            
            color = child_stats.get('color', '#9e9e9e')

            if max_games > min_games:
                thickness = 4 + 8 * ((child_node_obj.games - min_games) / (max_games - min_games))
            else:
                thickness = 6

            total_games = child_stats.get('games', 1)
            wins = child_stats.get('wins', 0)
            draws = child_stats.get('draws', 0)
            losses = child_stats.get('losses', 0)
            
            draw_rate = (draws / total_games) * 100 if total_games > 0 else 0
            lose_rate = (losses / total_games) * 100 if total_games > 0 else 0
            
            avg_elo_diff = None
            if move_uci in current_node_obj.elo_diff_sum and current_node_obj.elo_diff_count.get(move_uci, 0) > 0:
                avg_elo_diff = current_node_obj.elo_diff_sum[move_uci] / current_node_obj.elo_diff_count[move_uci]

            move_year_counts = {}
            if move_uci in current_node_obj.move_dates:
                for date_str in current_node_obj.move_dates[move_uci]:
                    try:
                        year = int(date_str.split('.')[2]) if '.' in date_str else int(date_str[:4])
                        if 1900 <= year <= 2030:
                            move_year_counts[year] = move_year_counts.get(year, 0) + 1
                    except (ValueError, IndexError):
                        continue

            moves_data.append({
                "uci": move_uci,
                "san": move_san,
                "fen_after_move": child_node_obj.fen,
                "fen": child_node_obj.fen,
                "games": child_stats.get('games', 0),
                "wins": wins,
                "draws": draws,
                "losses": losses,
                "win_rate": child_stats.get('win_rate', 0.0),
                "draw_rate": round(draw_rate, 1),
                "lose_rate": round(lose_rate, 1),
                "avg_elo_diff": round(avg_elo_diff, 1) if avg_elo_diff is not None else None,
                "move_year_counts": move_year_counts,
                "dates": current_node_obj.move_dates.get(move_uci, []),
                "parent_move_occurrences": current_node_obj.move_counts.get(move_uci, 0),
                "children_count": len(child_node_obj.children),
                "color": color,
                "thickness": thickness,
                "game_info": child_node_obj.games_info[0] if child_node_obj.games_info else None
            })
        
        # Optionally sort moves, e.g., by number of games or occurrences
        moves_data.sort(key=lambda x: x.get("parent_move_occurrences", 0), reverse=True)

        # Calculate total years for sparkline rendering
        all_years = set()
        for child_node_obj in filtered_children.values():
            for move_uci, dates in current_node_obj.move_dates.items():
                for date_str in dates:
                    try:
                        year = int(date_str.split('.')[2]) if '.' in date_str else int(date_str[:4])
                        if 1900 <= year <= 2030:
                            all_years.add(year)
                    except (ValueError, IndexError):
                        continue
        
        years_list = sorted(list(all_years)) if all_years else []

        return {
            "fen": fen,
            "node_stats": node_data, 
            "moves": moves_data,
            "years": years_list,
            "game_info": current_node_obj.games_info[:10] 
        }

    @staticmethod
    def result_rates_to_color(win_rate: float, draw_rate: float = 0.0, lose_rate: float = 0.0) -> str:
        """
        Static utility method to calculate color from win rate.
        Uses same color mapping as Node.get_move_color for consistency.
        """
        # Map win rate to color gradient from red to yellow to green
        if win_rate >= 65:
            return "#4caf50"    # Green for excellent (65%+)
        elif win_rate >= 55:
            return "#8bc34a"    # Light green for good (55-64%)
        elif win_rate >= 45:
            return "#ffeb3b"    # Yellow for average (45-54%)
        elif win_rate >= 35:
            return "#ff9800"    # Orange for below average (35-44%)
        else:
            return "#f44336"    # Red for poor (below 35%)

    # normalize_name is not used within OpeningTree anymore, can be removed if not used by other methods.
    # def normalize_name(self, name_str: Optional[str]) -> Set[str]:
    #     if not name_str:
    #         return set()
    #     # ... (implementation from old _process_game)
    #     return {name_str.lower()} # Simplified, real normalization is more complex

    # load_pgns and _process_game are removed as their logic is now externalized or in add_game_to_tree

    def print_tree(self, max_depth=3, max_children=5):
        """
        Gibt den OpeningTree im Terminal aus (bis zu max_depth Ebenen, max_children pro Knoten).
        Zeigt Züge, FEN, Spiele, Winrate, etc. mit Einrückung und jetzt auch die Node-ID.
        """
        from collections import deque
        def node_summary(node, move_san=None):
            return f"{move_san or ''} [ID: {node.id[:8]}] [Games: {node.games}, Win%: {node.get_win_rate():.1f}]"
        queue = deque()
        # Suche Root-Node (kann jetzt nur noch über nodes_by_fen gefunden werden)
        root = self.nodes_by_fen.get(self._get_node_key(self.root_fen))
        if not root:
            print("[print_tree] Kein Root-Knoten gefunden.")
            return
        queue.append((root, 0, None))  # (node, depth, move_san)
        while queue:
            node, depth, move_san = queue.popleft()
            indent = '  ' * depth
            prefix = f"{indent}{'└─' if depth else ''}"
            print(f"{prefix}{node_summary(node, move_san)}")
            if depth < max_depth:
                # Sortiere Kinder nach Häufigkeit
                children = sorted(node.children.items(), key=lambda x: x[1].games, reverse=True)
                for i, (uci, child) in enumerate(children):
                    if i >= max_children:
                        print(f"{indent}  ... weitere Züge ...")
                        break
                    queue.append((child, depth+1, child.move_san))

    def get_source_files_for_position(self, fen: str) -> Set[str]:
        """
        Returns the set of files that contributed moves leading to this position.
        """
        node_key = self._get_node_key(fen)
        node = self.nodes_by_fen.get(node_key)
        if node:
            return node.source_files.copy()
        return set()

    def get_or_create_child_by_id_and_move(self, node_id: str, move_san: str, save_switch_active: bool = False, legal_moves=None):
        import chess
        import logging
        import traceback
        import os
        from add_opening_lines import smart_save_opening_line
        logger = logging.getLogger("opening_tree")
        # 1. Find the current node
        current_node = self.nodes.get(node_id)
        if not current_node:
            logger.error(f"[get_or_create_child_by_id_and_move] Node with id {node_id} not found.")
            raise ValueError(f"Node with id {node_id} not found.")
        # 2. Use the node's FEN to parse the move_san to UCI
        board = chess.Board(current_node.fen)
        try:
            move = board.parse_san(move_san)
            move_uci = move.uci()
        except Exception as e:
            logger.error(f"[get_or_create_child_by_id_and_move] Invalid move SAN '{move_san}' for node {node_id}: {e}")
            logger.error(traceback.format_exc())
            raise ValueError(f"Invalid move SAN '{move_san}' for node {node_id}: {e}")
        # 4. Look for the child node in current_node.children (by UCI)
        child_node = current_node.children.get(move_uci)
        if child_node:
            return child_node.to_dict(self.current_perspective_color, include_children=True, is_repertoire=self.own_repertoir)
        # 5. If not, create the child node, add it to the tree, and return its to_dict(...)
        board.push(move)  # <-- Apply the move before getting the FEN!
        new_fen = board.fen()
        # --- NEU: Einheitliche is_in_repertoire-Logik wie in add_game_to_tree ---
        color_after_move = 'white' if board.turn else 'black'
        parent_is_in_repertoire = current_node.is_in_repertoire
        if self.own_repertoir:
            is_in_repertoire = True
        else:
            if color_after_move == 'white':
                is_in_repertoire = parent_is_in_repertoire
            else:
                is_in_repertoire = not parent_is_in_repertoire
        logger.info(f"[get_or_create_child_by_id_and_move] move={move_san} parent_is_in_repertoire={parent_is_in_repertoire} color_after_move={color_after_move} is_in_repertoire={is_in_repertoire}")
        child_node = Node(new_fen, move_san=move_san, parent_fen=current_node.fen, parent_id=current_node.id, is_in_repertoire=is_in_repertoire)
        
        # Set games count based on save switch
        if save_switch_active:
            child_node.games = 1
            logger.info(f"[NODE CREATE] move={move_san} parent={current_node.id[:8]} id={child_node.id[:8]} games={child_node.games} context=get_or_create_child_by_id_and_move SAVED")
            logger.warning(f"[PGN-DEBUG] save_switch_active=True, will try to save PGN for player={self.player_name}, move={move_san}, node_id={node_id}")
            try:
                # Find path from root to current position using parent IDs
                path_to_current = self._find_path_to_root(current_node)
                complete_path = path_to_current + [move_san]
                start_fen = chess.STARTING_FEN
                logger.warning(f"[PGN-DEBUG] About to call smart_save_opening_line(player={self.player_name}, start_fen={start_fen}, complete_path={complete_path})")
                file_name, replaced_files = smart_save_opening_line(self.player_name, start_fen, complete_path)
                logger.warning(f"[PGN-DEBUG] smart_save_opening_line returned file_name={file_name}, replaced_files={replaced_files}")
                pgn_path = os.path.join("players", self.player_name, 'pgn', file_name)
                if os.path.exists(pgn_path):
                    import chess.pgn
                    with open(pgn_path, 'r', encoding='utf-8', errors='ignore') as pgn_file:
                        new_game = chess.pgn.read_game(pgn_file)
                    if new_game is not None:
                        headers = new_game.headers
                        white_elo = self._safe_int(headers.get("WhiteElo"))
                        black_elo = self._safe_int(headers.get("BlackElo"))
                        game_details = dict(headers)
                        player_color, result_for_player, skip_stats, actual_color, skip_reason = self._get_player_perspective_color_and_result(
                            headers, self.player_name, self.current_perspective_color)
                        if player_color is not None:
                            self.add_game_to_tree(
                                new_game, pgn_path, player_color, result_for_player, skip_stats, game_details, white_elo, black_elo)
                            logger.warning(f"[PGN-DEBUG] Tree updated with new PGN file {file_name}")
            except Exception as e:
                logger.error(f"[PGN-DEBUG] Exception while saving PGN: {e}")
                logger.error(traceback.format_exc())
        else:
            child_node.games = 0
            logger.info(f"[NODE CREATE] move={move_san} parent={current_node.id[:8]} id={child_node.id[:8]} games={child_node.games} context=get_or_create_child_by_id_and_move TEMPORARY")
        
        current_node.add_child(move_uci, child_node)
        self.nodes[child_node.id] = child_node
        self.nodes_by_fen[self._get_node_key(new_fen)] = child_node
        return child_node.to_dict(self.current_perspective_color, include_children=True, is_repertoire=self.own_repertoir)
    
    def _find_path_to_root(self, current_node):
        """
        Findet den Pfad von der aktuellen Position zur Wurzel durch Parent-IDs.
        Returns: Liste von SAN-Zügen von Wurzel zur aktuellen Position.
        """
        path = []
        node = current_node
        while node.parent_id is not None:
            path.append(node.move_san)
            node = self.nodes.get(node.parent_id)
            if node is None:
                break
        return path[::-1]  # Umkehren für korrekte Reihenfolge
    
    def _safe_int(self, value):
        """Safe integer conversion"""
        try:
            return int(value) if value else 0
        except (ValueError, TypeError):
            return 0
    
    # ====================================================================
    # LEARNING STATUS METHODS FOR OPENING TREE
    # ====================================================================
    
    def mark_node_as_studied(self, node_id: str, session_id: str) -> bool:
        """Mark a node as studied and propagate status up the tree"""
        try:
            node = self.nodes.get(node_id)
            if not node:
                logger.error(f"[LEARNING] Node {node_id} not found")
                return False
            
            # Mark current node as studied
            node.mark_as_studied(session_id)
            
            # Propagate learning status up the tree
            self._propagate_learning_status(node, session_id)
            
            logger.info(f"[LEARNING] Successfully marked node {node_id[:8]} as studied and propagated status")
            return True
            
        except Exception as e:
            logger.error(f"[LEARNING] Error marking node as studied: {e}")
            return False
    
    def _propagate_learning_status(self, node: Node, session_id: str):
        """Recursively propagate learning status up the tree"""
        # Check if parent should also be marked as studied
        if node.parent_id:
            parent = self.nodes.get(node.parent_id)
            if parent and parent.should_be_studied(session_id):
                parent.mark_as_studied(session_id)
                logger.info(f"[LEARNING] Propagated to parent {parent.id[:8]} (all children studied)")
                # Continue propagation up the tree
                self._propagate_learning_status(parent, session_id)
    
    def get_unstudied_moves_from_position(self, fen: str, session_id: str) -> Dict[str, Any]:
        """Get only unstudied moves from current position"""
        try:
            node_key = self._get_node_key(fen)
            current_node = self.nodes_by_fen.get(node_key)
            
            if not current_node:
                logger.warning(f"[LEARNING] Position not found in tree: {fen[:50]}...")
                return {"fen": fen, "error": "Position not found", "moves": [], "node_stats": {}}
            
            # Get all children that are not studied
            unstudied_children = current_node.get_unstudied_children(session_id)
            
            # Convert to moves format
            moves_data = []
            for uci, child in current_node.children.items():
                if not child.is_studied(session_id):  # Only include unstudied moves
                    moves_data.append({
                        'uci': uci,
                        'san': child.move_san,
                        'color': child.get_move_color(self.own_repertoir),
                        'games': child.games,
                        'wins': child.wins,
                        'draws': child.draws,
                        'losses': child.losses,
                        'win_rate': child.get_win_rate(),
                        'studied': False
                    })
            
            # Get node stats
            node_stats = {
                'id': current_node.id,
                'games': current_node.games,
                'wins': current_node.wins,
                'draws': current_node.draws,
                'losses': current_node.losses,
                'win_rate': current_node.get_win_rate(),
                'studied': current_node.is_studied(session_id),
                'total_children': len(current_node.children),
                'unstudied_children': len(unstudied_children)
            }
            
            logger.info(f"[LEARNING] Position {fen[:30]}...: {len(moves_data)} unstudied moves out of {len(current_node.children)} total")
            
            return {
                "fen": fen,
                "moves": moves_data,
                "node_stats": node_stats
            }
            
        except Exception as e:
            logger.error(f"[LEARNING] Error getting unstudied moves: {e}")
            return {"fen": fen, "error": str(e), "moves": [], "node_stats": {}}
    
    def get_learning_progress(self, session_id: str) -> Dict[str, Any]:
        """Get overall learning progress for the session"""
        try:
            # Zähle alle eigenen Repertoire-Züge (Nodes mit is_in_repertoire=True und move_san!=None)
            repertoire_nodes = [
                node for node in self.nodes.values()
                if node.is_in_repertoire and node.move_san is not None
            ]
            total_repertoire_moves = len(repertoire_nodes)
            # Zähle davon die als studied markierten
            studied_repertoire_moves = sum(
                1 for node in repertoire_nodes if node.is_studied(session_id)
            )
            progress = {
                'session_id': session_id,
                'studied_moves': studied_repertoire_moves,
                'total_moves': total_repertoire_moves,
                'note': 'Nur eigene Repertoire-Züge werden gezählt (keine Gegnerzüge, keine propagierten Elternknoten ohne eigenen Zug)'
            }
            logger.info(f"[LEARNING] Progress for session {session_id[:8]}: {studied_repertoire_moves}/{total_repertoire_moves} eigene Repertoire-Züge gelernt")
            return progress
        except Exception as e:
            logger.error(f"[LEARNING] Error getting learning progress: {e}")
            return {'error': str(e)}

    # --- NEU: Fehlerzähler-Logik ---
    def increment_mistake(self, session_id: str):
        self.mistake_count_per_session[session_id] += 1
    
    def get_mistake_count(self, session_id: str) -> int:
        return self.mistake_count_per_session.get(session_id, 0)
    
    # --- NEU: Direkt gelernt Zählung ---
    def get_directly_learned_count(self, session_id: str) -> int:
        return sum(1 for node in self.nodes.values() if node.is_in_repertoire and node.move_san is not None and node.is_directly_learned(session_id))
    
    def get_directly_learned_node_ids(self, session_id: str) -> List[str]:
        return [node.id for node in self.nodes.values() if node.is_in_repertoire and node.move_san is not None and node.is_directly_learned(session_id)]

    def delete_node_and_subtree(self, node_id: str):
        """
        Löscht den Node mit node_id und alle Nachkommen rekursiv aus dem Baum und entfernt die Verbindung zum Parent.
        """
        if node_id not in self.nodes:
            return False  # Node existiert nicht
        node = self.nodes[node_id]
        # Zuerst alle Children rekursiv löschen
        for child in list(node.children.values()):
            self.delete_node_and_subtree(child.id)
        # Verbindung zum Parent entfernen
        if node.parent_id and node.parent_id in self.nodes:
            parent = self.nodes[node.parent_id]
            # Finde den Key (UCI) für dieses Child
            for uci, child_node in list(parent.children.items()):
                if child_node.id == node_id:
                    del parent.children[uci]
                    break
        # Aus Indexen entfernen
        if node_id in self.nodes:
            del self.nodes[node_id]
        if node.fen in self.nodes_by_fen:
            del self.nodes_by_fen[node.fen]
        return True
