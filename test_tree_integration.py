#!/usr/bin/env python3
"""
Test OpeningTree with correct perspective
"""

import os
import sys

# Add current directory to path so we can import the modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from opening_tree import OpeningTree

def test_opening_tree_with_black_perspective():
    """Test with OpeningTree using black perspective"""
    print("🌳 Testing OpeningTree with BLACK perspective...")
    
    try:
        # Create OpeningTree for Hikaru as BLACK
        tree = OpeningTree(player_name="Hikaru_Nakamura", initial_perspective_color="black", own_repertoir=False)
        
        # Load one PGN file manually to see what happens
        player_dir = r"c:\Users\anton\Desktop\osiris_openings\players\Hikaru_Nakamura\pgn"
        test_file = os.path.join(player_dir, "Hikaru_Nakamura_game_1.pgn")
        
        if os.path.exists(test_file):
            with open(test_file, 'r', encoding='utf-8', errors='ignore') as f:
                import chess.pgn
                game = chess.pgn.read_game(f)
                if game:
                    headers = game.headers
                    white_elo = int(headers.get("WhiteElo", "0"))
                    black_elo = int(headers.get("BlackElo", "0"))
                    game_details = dict(headers)
                    
                    print(f"  📋 Game info:")
                    print(f"     White: {headers.get('White')}")
                    print(f"     Black: {headers.get('Black')}")
                    print(f"     Result: {headers.get('Result')}")
                    
                    # Test perspective logic with BLACK
                    player_color, result_for_player, skip_stats, actual_color, skip_reason = tree._get_player_perspective_color_and_result(
                        headers, "Hikaru_Nakamura", "black")
                    
                    print(f"  📋 Game analysis result (BLACK perspective):")
                    print(f"     Player color: {player_color}")
                    print(f"     Result for player: {result_for_player}")
                    print(f"     Skip stats: {skip_stats}")
                    print(f"     Skip reason: {skip_reason}")
                    
                    if player_color:
                        print(f"  🌳 Adding game to tree...")
                        tree.add_game_to_tree(game, test_file, player_color, result_for_player, skip_stats, game_details, white_elo, black_elo)
                        print(f"  ✅ Game added successfully!")
                        print(f"     Tree now has {len(tree.nodes)} nodes")
                        
                        # Check root node stats
                        root_node = tree.nodes[tree.root_fen]
                        print(f"  📊 Root node stats:")
                        print(f"     Games: {root_node.games}")
                        print(f"     Wins: {root_node.wins}")
                        print(f"     Draws: {root_node.draws}")
                        print(f"     Losses: {root_node.losses}")
                        print(f"     Children: {len(root_node.children)}")
                        
                    else:
                        print(f"  ⏭️  Game skipped: {skip_reason}")
        else:
            print(f"  ❌ Test file not found: {test_file}")
            
    except Exception as e:
        print(f"  ❌ Error in OpeningTree integration: {e}")
        import traceback
        traceback.print_exc()

def test_loading_multiple_games():
    """Test loading multiple games to see draw counting"""
    print("\n📂 Testing multiple games loading...")
    
    try:
        tree = OpeningTree(player_name="Hikaru_Nakamura", initial_perspective_color="black", own_repertoir=False)
        
        player_dir = r"c:\Users\anton\Desktop\osiris_openings\players\Hikaru_Nakamura\pgn"
        pgn_files = [f for f in os.listdir(player_dir) if f.endswith('.pgn')][:10]  # First 10 files
        
        games_loaded = 0
        games_skipped = 0
        total_draws_added = 0
        
        for pgn_file in pgn_files:
            file_path = os.path.join(player_dir, pgn_file)
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                import chess.pgn
                game = chess.pgn.read_game(f)
                if game:
                    headers = game.headers
                    white_elo = int(headers.get("WhiteElo", "0"))
                    black_elo = int(headers.get("BlackElo", "0"))
                    game_details = dict(headers)
                    
                    player_color, result_for_player, skip_stats, actual_color, skip_reason = tree._get_player_perspective_color_and_result(
                        headers, "Hikaru_Nakamura", "black")
                    
                    if player_color:
                        # Check if this is a draw before adding
                        if result_for_player == '1/2':
                            total_draws_added += 1
                            print(f"  🟡 Adding DRAW game {pgn_file}: Result='{headers.get('Result')}' -> Player result='{result_for_player}'")
                        
                        tree.add_game_to_tree(game, file_path, player_color, result_for_player, skip_stats, game_details, white_elo, black_elo)
                        games_loaded += 1
                    else:
                        games_skipped += 1
        
        print(f"\n📊 Loading summary:")
        print(f"   Games loaded: {games_loaded}")
        print(f"   Games skipped: {games_skipped}")
        print(f"   Draws detected: {total_draws_added}")
        
        # Check final root node stats
        root_node = tree.nodes[tree.root_fen]
        print(f"  📊 Final root node stats:")
        print(f"     Games: {root_node.games}")
        print(f"     Wins: {root_node.wins}")
        print(f"     Draws: {root_node.draws}")
        print(f"     Losses: {root_node.losses}")
        
    except Exception as e:
        print(f"  ❌ Error loading multiple games: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_opening_tree_with_black_perspective()
    test_loading_multiple_games()
