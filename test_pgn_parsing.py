#!/usr/bin/env python3
"""
Simple PGN parsing test to debug the "illegal san" errors
"""

import chess.pgn
import os
import sys

# Add current directory to path so we can import the modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from opening_tree import OpeningTree

def test_direct_pgn_parsing():
    """Test direct PGN parsing without the OpeningTree to isolate issues"""
    player_dir = r"c:\Users\anton\Desktop\osiris_openings\players\Hikaru_Nakamura\pgn"
    
    if not os.path.exists(player_dir):
        print(f"❌ Directory not found: {player_dir}")
        return
    
    pgn_files = [f for f in os.listdir(player_dir) if f.endswith('.pgn')][:3]  # Test first 3 files
    
    total_games = 0
    total_draws = 0
    successful_games = 0
    failed_games = 0
    
    for pgn_file in pgn_files:
        file_path = os.path.join(player_dir, pgn_file)
        print(f"\n📄 Testing file: {pgn_file}")
        
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                game = chess.pgn.read_game(f)
                if game is None:
                    print("  ❌ No game found in file")
                    continue
                
                total_games += 1
                headers = game.headers
                result = headers.get("Result", "*")
                white = headers.get("White", "")
                black = headers.get("Black", "")
                
                print(f"  📋 Headers: White='{white}', Black='{black}', Result='{result}'")
                
                # Check if this is a draw
                if result in ["½-½", "1/2-1/2"]:
                    total_draws += 1
                    print(f"  🟡 DRAW FOUND: {result}")
                
                # Try to parse moves
                board = chess.Board()
                move_count = 0
                parse_success = True
                
                for move in game.mainline_moves():
                    try:
                        move_san = board.san(move)
                        board.push(move)
                        move_count += 1
                        if move_count > 20:  # Only show first 20 moves
                            break
                    except Exception as e:
                        print(f"  ❌ Error on move {move_count + 1}: {e}")
                        print(f"      Move UCI: {move.uci()}")
                        print(f"      Board FEN: {board.fen()}")
                        parse_success = False
                        failed_games += 1
                        break
                
                if parse_success:
                    successful_games += 1
                    print(f"  ✅ Successfully parsed {move_count} moves")
                
        except Exception as e:
            print(f"  ❌ Error reading file: {e}")
            failed_games += 1
    
    print(f"\n📊 SUMMARY:")
    print(f"   Total games tested: {total_games}")
    print(f"   Successful parses: {successful_games}")
    print(f"   Failed parses: {failed_games}")
    print(f"   Draws found: {total_draws}")
    print(f"   Draw rate: {(total_draws/total_games*100) if total_games > 0 else 0:.1f}%")

def test_opening_tree_integration():
    """Test with OpeningTree to see if the issue is in the integration"""
    print("\n🌳 Testing OpeningTree integration...")
    
    try:
        # Create OpeningTree for Hikaru as white
        tree = OpeningTree(player_name="Hikaru_Nakamura", initial_perspective_color="white", own_repertoir=False)
        
        # Load one PGN file manually to see what happens
        player_dir = r"c:\Users\anton\Desktop\osiris_openings\players\Hikaru_Nakamura\pgn"
        test_file = os.path.join(player_dir, "Hikaru_Nakamura_game_1.pgn")
        
        if os.path.exists(test_file):
            with open(test_file, 'r', encoding='utf-8', errors='ignore') as f:
                game = chess.pgn.read_game(f)
                if game:
                    headers = game.headers
                    white_elo = int(headers.get("WhiteElo", "0"))
                    black_elo = int(headers.get("BlackElo", "0"))
                    game_details = dict(headers)
                    
                    # Test perspective logic
                    player_color, result_for_player, skip_stats, actual_color, skip_reason = tree._get_player_perspective_color_and_result(
                        headers, "Hikaru_Nakamura", "white")
                    
                    print(f"  📋 Game analysis result:")
                    print(f"     Player color: {player_color}")
                    print(f"     Result for player: {result_for_player}")
                    print(f"     Skip stats: {skip_stats}")
                    print(f"     Skip reason: {skip_reason}")
                    
                    if player_color:
                        print(f"  🌳 Adding game to tree...")
                        tree.add_game_to_tree(game, test_file, player_color, result_for_player, skip_stats, game_details, white_elo, black_elo)
                        print(f"  ✅ Game added successfully!")
                        print(f"     Tree now has {len(tree.nodes)} nodes")
                    else:
                        print(f"  ⏭️  Game skipped: {skip_reason}")
        else:
            print(f"  ❌ Test file not found: {test_file}")
            
    except Exception as e:
        print(f"  ❌ Error in OpeningTree integration: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_direct_pgn_parsing()
    test_opening_tree_integration()
