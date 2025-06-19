#!/usr/bin/env python3
"""
Test the full API flow manually
"""

import os
import sys
import json

# Add current directory to path so we can import the modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from opening_tree import OpeningTree

def test_api_flow():
    """Simulate the API flow that the frontend would use"""
    print("🔄 Testing full API flow...")
    
    try:
        # Step 1: Create tree (equivalent to /api/set_player)
        print("\n📝 Step 1: Setting player (like /api/set_player)")
        current_player = "Hikaru_Nakamura"
        color = "black"  # Use black since we know Hikaru plays as black in those games
        
        tree = OpeningTree(player_name=current_player, initial_perspective_color=color, own_repertoir=False)
        
        # Step 2: Load games (equivalent to the loading in set_player)
        print(f"\n📂 Step 2: Loading PGN files for {current_player} as {color}")
        player_dir = os.path.join("players", current_player, "pgn")
        
        if not os.path.exists(player_dir):
            print(f"❌ Player directory not found: {player_dir}")
            return
            
        pgn_files = [f for f in os.listdir(player_dir) if f.endswith('.pgn')][:20]  # Test first 20 files
        games_loaded = 0
        games_skipped = 0
        
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
                        headers, current_player, color)
                    
                    if player_color:
                        tree.add_game_to_tree(game, file_path, player_color, result_for_player, skip_stats, game_details, white_elo, black_elo)
                        games_loaded += 1
                    else:
                        games_skipped += 1
        
        print(f"   Loaded: {games_loaded} games, Skipped: {games_skipped} games")
        
        # Step 3: Get moves for initial position (equivalent to /api/moves/{fen})
        print(f"\n🎯 Step 3: Getting moves for starting position")
        initial_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        
        moves_data = tree.get_moves_from_position(initial_fen, perspective_color_str=color)
        
        if moves_data and 'moves' in moves_data:
            moves = moves_data['moves']
            print(f"   Found {len(moves)} possible moves")
            
            # Show details of first few moves
            for i, move in enumerate(moves[:5]):
                games = move.get('games', 0)
                wins = move.get('wins', 0)
                draws = move.get('draws', 0)
                losses = move.get('losses', 0)
                win_rate = move.get('win_rate', 0)
                draw_rate = move.get('draw_rate', 0)
                
                print(f"   Move {i+1}: {move.get('san', 'unknown')}")
                print(f"      Games: {games}, Wins: {wins}, Draws: {draws}, Losses: {losses}")
                print(f"      Win%: {win_rate:.1f}%, Draw%: {draw_rate:.1f}%")
                
                # Frontend-style logging
                print(f"      [Move]: {wins}W + {draws}D + {losses}L = {games} Total")
                
                if draws > 0:
                    print(f"      🟡 DRAW DATA FOUND! {draws} draws in {games} games")
            
            # Count moves with draws
            moves_with_draws = [m for m in moves if m.get('draws', 0) > 0]
            total_draws = sum(m.get('draws', 0) for m in moves)
            print(f"\n📊 Summary:")
            print(f"   Moves with draws: {len(moves_with_draws)}/{len(moves)}")
            print(f"   Total draws across all moves: {total_draws}")
            
            if len(moves_with_draws) > 0:
                print(f"   🟡 SUCCESS: Draw data is present and will be visible!")
            else:
                print(f"   ❌ No draw data found in moves")
                
        else:
            print(f"   ❌ No moves data returned")
            
    except Exception as e:
        print(f"❌ Error in API flow test: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_api_flow()
