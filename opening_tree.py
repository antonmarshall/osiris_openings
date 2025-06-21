import logging
import chess
import chess.pgn
import os
from collections import defaultdict, deque
from typing import Dict, Any, Optional, List, Set, Tuple

logger = logging.getLogger(__name__)

# Helper to create a unique FEN key without en passant, castling, halfmove, fullmove
def get_fen_key(board: chess.Board) -> str:
    return board.fen().split(' ')[0] # Only piece placement

class Node:
    """
    Knoten im Eröffnungsbaum, der eine Schachstellung und Statistiken repräsentiert.
    """
    __slots__ = ("fen", "games", "wins", "draws", "losses", "children", "games_info", "move_counts", "elo_diff_sum", "elo_diff_count", "move_dates", "move_san", "parent_fen", "source_files")
    
    def __init__(self, fen: str, move_san: Optional[str] = None, parent_fen: Optional[str] = None):
        self.fen = fen
        self.move_san = move_san
        self.parent_fen = parent_fen
        self.children: Dict[str, Node] = {}
        self.games = 0
        self.wins = 0
        self.draws = 0
        self.losses = 0
        self.games_info: List[Dict[str, Any]] = [] # Corrected type hint and attribute name
        self.move_counts: Dict[str, int] = {}
        self.elo_diff_sum: Dict[str, int] = {}
        self.elo_diff_count: Dict[str, int] = {}
        self.move_dates: Dict[str, List[str]] = {}
        self.source_files: Set[str] = set()  # Track which files contributed to this node

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
    
    def to_dict(self, perspective_color_str: str, include_children: bool = True, max_depth: int = 20, current_depth: int = 0, is_repertoire: bool = False) -> Dict[str, Any]:
        # perspective_color_str helps interpret 'wins', 'draws', 'losses' if they were stored
        # from a neutral point of view. Here, they are stored from self.player_name's view.
        win_rate = self.get_win_rate()
        color = self.get_move_color(is_repertoire)
        result = {
            'fen': self.fen,
            'move_san': self.move_san, # The move (SAN) that led to this FEN from parent
            'parent_fen': self.parent_fen,
            'games': self.games, # Total games reaching this FEN
            'wins': self.wins,   # Wins for the analyzed player from this FEN onwards (if this node is a terminal state for a game) or leading to this state
            'draws': self.draws,
            'losses': self.losses,
            'win_rate': round(win_rate, 2),
            'color': color,
            'game_info': self.games_info[:10] # Limit game_info for brevity
        }
          # Only include children if requested, within depth limit, and we have children
        if include_children and current_depth < max_depth and self.children:
            result['children'] = {uci: child.to_dict(perspective_color_str, include_children, max_depth, current_depth + 1, is_repertoire) 
                                for uci, child in self.children.items()}
        else:
            result['children'] = {}
        
        return result

class OpeningTree:
    """
    Analysiert PGN-Dateien eines Spielers und baut einen Baum der Eröffnungen
    (Stellungen und Züge mit statistischen Erfolgsdaten).
    """
    def __init__(self, player_name: Optional[str] = None, initial_perspective_color: str = 'white', own_repertoir: bool = False):
        self.root_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1"  # Normalized starting FEN
        self.player_name = player_name
        self.current_perspective_color = initial_perspective_color.lower() # Perspective for which the tree is built
        self.own_repertoir = own_repertoir  # True for repertoire players (white_repertoir, black_repertoir)
        self.nodes: Dict[str, Node] = {}
        root_node_obj = Node(self.root_fen)
        self.nodes[self.root_fen] = root_node_obj
        
        self.processed_files: Set[str] = set()
        # player_color_map might be useful if tree stores games from multiple perspectives simultaneously
        self.player_color_map: Dict[str, str] = {} 

        # tree_dict and nodes_by_fen are deprecated in favor of self.nodes holding Node objects.
        # They can be populated on-demand when needed for serialization.
        self.tree_dict: Dict[str, Dict[str, Any]] = {}
        self.nodes_by_fen: Dict[str, Dict[str, Any]] = {}
        
        logger.info(f"OpeningTree initialized for player: {self.player_name}, perspective: {self.current_perspective_color}. Root FEN: {self.root_fen}")

    def normalize_fen(self, fen: str) -> str:
        """
        Normalisiert eine FEN-String für Tree-Lookups, entfernt en passant, castling rights, etc.
        Behält nur Figurenpositionen und wer am Zug ist.
        """
        try:
            board = chess.Board(fen)
            # Erstelle normalisierte FEN: nur Figuren + aktiver Spieler + 0 0 (Halbzüge und Vollzüge auf 0)
            fen_parts = board.fen().split(' ')
            # Format: pieces turn castling en_passant halfmove fullmove
            # Wir behalten: pieces turn, setzen castling="-", en_passant="-", halfmove="0", fullmove="1"
            normalized = f"{fen_parts[0]} {fen_parts[1]} - - 0 1"
            return normalized
        except Exception as e:
            logger.error(f"Error normalizing FEN '{fen}': {e}")
            return fen  # Return original if normalization fails

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
        player_elo_for_game = 0
        opponent_elo_for_game = 0
        if player_actual_color_in_game == 'white':
            player_elo_for_game = white_elo
            opponent_elo_for_game = black_elo
        elif player_actual_color_in_game == 'black':
            player_elo_for_game = black_elo
            opponent_elo_for_game = white_elo

        # Board for replaying moves and generating SAN/FEN for tree nodes
        # This board always starts from the standard initial position for tree construction.
        # Moves from pgn_game are applied one by one.
        current_board_in_tree = chess.Board() 
        current_node_in_tree = self.nodes[self.root_fen] # Start from the tree's root Node object

        # Apply moves from the PGN game to our tree
        for move_index, move in enumerate(pgn_game.mainline_moves()):
            parent_node_in_tree = current_node_in_tree
            move_uci = move.uci()
            try:
                move_san = current_board_in_tree.san(move)
                current_board_in_tree.push(move)
            except Exception as e:
                logger.error(f"❌ Error processing move {move_index + 1} in {pgn_file_path}:")
                logger.error(f"    Move UCI: {move_uci}")
                logger.error(f"    Board FEN before move: {current_board_in_tree.fen()}")
                logger.error(f"    Error: {e}")
                logger.error(f"    Game headers: White='{game_details.get('White', 'N/A')}', Black='{game_details.get('Black', 'N/A')}', Result='{game_details.get('Result', 'N/A')}'")
                logger.error(f"⏭️  Skipping rest of game due to illegal move.")
                break
            
            # Normalize FEN for consistent tree storage
            new_fen_in_tree = self.normalize_fen(current_board_in_tree.fen())
            child_node_obj = self.nodes.get(new_fen_in_tree)
            if child_node_obj is None:
                child_node_obj = Node(new_fen_in_tree, move_san=move_san, parent_fen=parent_node_in_tree.fen)
                self.nodes[new_fen_in_tree] = child_node_obj
            parent_node_in_tree.add_child(move_uci, child_node_obj)
            child_node_obj.increment_game_stats(result_for_player, game_details, skip_stats, self.own_repertoir)
            
            # Track source file for this node
            child_node_obj.source_files.add(pgn_file_path)
            
            parent_node_in_tree.move_counts[move_uci] = parent_node_in_tree.move_counts.get(move_uci, 0) + 1
            if not skip_stats:
                parent_node_in_tree.elo_diff_sum[move_uci] = parent_node_in_tree.elo_diff_sum.get(move_uci, 0) + (player_elo_for_game - opponent_elo_for_game)
                parent_node_in_tree.elo_diff_count[move_uci] = parent_node_in_tree.elo_diff_count.get(move_uci, 0) + 1
                parent_node_in_tree.move_dates.setdefault(move_uci, []).append(game_details.get("Datum", "?"))
            # --- LOG: Nach jedem Zug die Children des aktuellen Knotens ausgeben ---
            if move_index == 0 or move_index == len(list(pgn_game.mainline_moves()))-1 or move_index < 5:
                children = parent_node_in_tree.children
                if children:
                    log_lines = [
                        f"    ├─ {self.nodes[child.fen].move_san or uci:<6} | Games: {child.games:<3} | Win%: {child.get_win_rate():5.1f}"
                        for uci, child in children.items()
                    ]
                    logger.info(f"\n[Tree] Nach Zug '{move_san}':\n" + "\n".join(log_lines))
            current_node_in_tree = child_node_obj
        
        # Mark PGN file as processed for this tree instance if needed
        self.processed_files.add(pgn_file_path)
    def get_tree_data(self, fen: str, perspective_color_str: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Retrieves the dictionary representation of a node and its children.
        Perspective color string determines how win rates are interpreted if they were neutral.
        (Here, stats are already from player's perspective).
        """
        # Use normalized FEN for lookup
        normalized_fen = self.normalize_fen(fen)
        node_obj = self.nodes.get(normalized_fen) or self.nodes.get(fen)
        if node_obj:
            # Use the tree's current perspective if none is provided for display
            display_perspective = perspective_color_str or self.current_perspective_color
            return node_obj.to_dict(display_perspective, include_children=True, max_depth=10)
        logger.info(f"🔍 Node nicht gefunden für FEN: {fen[:50]}... (normalized: {normalized_fen[:50]}...) in get_tree_data")
        return None

    def get_moves_from_position(self, fen: str, perspective_color_str: Optional[str] = None) -> Dict[str, Any]:
        """
        Returns data for the given FEN and all direct child moves.
        """        # Normalisiere die FEN für Tree-Lookup (entferne en passant, castling, etc.)
        normalized_fen = self.normalize_fen(fen)
        # Versuche erst mit normalisierter FEN, dann mit Original-FEN
        current_node_obj = self.nodes.get(normalized_fen) or self.nodes.get(fen)
        display_perspective = perspective_color_str or self.current_perspective_color

        if not current_node_obj:
            logger.info(f"🔍 Node nicht gefunden für FEN: {fen[:50]}... (normalized: {normalized_fen[:50]}...) in get_moves_from_position")
            return {"fen": fen, "error": "Position not found in tree", "moves": [], "node_stats": {}}

        # DEBUG: Log tree context
        logger.info(f"🔍 TREE CONTEXT: player={self.player_name} | perspective={display_perspective} | "
                   f"own_repertoir={self.own_repertoir} | children_count={len(current_node_obj.children)}")

        node_data = current_node_obj.to_dict(display_perspective, include_children=False, max_depth=1) # Stats of the current FEN

        moves_data = []
        board_at_fen = chess.Board(fen) # Board needed to correctly SAN parse UCI moves from this FEN        # Pre-calculate game counts for thickness calculation
        game_counts = [child_node_obj.games for child_node_obj in current_node_obj.children.values()]
        max_games = max(game_counts) if game_counts else 1
        min_games = min(game_counts) if game_counts else 0

        for move_uci, child_node_obj in current_node_obj.children.items():
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
        for child_node_obj in current_node_obj.children.values():
            for move_uci, dates in current_node_obj.move_dates.items():
                for date_str in dates:
                    try:
                        year = int(date_str.split('.')[2]) if '.' in date_str else int(date_str[:4])
                        if 1900 <= year <= 2030:
                            all_years.add(year)
                    except (ValueError, IndexError):
                        continue
        
        years_list = sorted(list(all_years)) if all_years else []

        return {            "fen": fen,
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
        Zeigt Züge, FEN, Spiele, Winrate, etc. mit Einrückung.
        """
        from collections import deque
        def node_summary(node, move_san=None):
            return f"{move_san or ''} [Games: {node.games}, Win%: {node.get_win_rate():.1f}]"
        queue = deque()
        root = self.nodes.get(self.root_fen)
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
        normalized_fen = self.normalize_fen(fen)
        node = self.nodes.get(normalized_fen)
        if node:
            return node.source_files.copy()
        return set()
