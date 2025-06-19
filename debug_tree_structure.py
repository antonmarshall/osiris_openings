#!/usr/bin/env python3
"""
Debug the tree structure to understand where stats are stored
"""

import os
import sys
import chess

# Add current directory to path so we can import the modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from opening_tree import OpeningTree

def debug_tree_structure():
    """Debug where the statistics are actually stored in the tree"""
    print("🔍 Debugging tree structure...")
    
    try:
        # Load a simple case
        tree = OpeningTree(player_name="Hikaru_Nakamura", initial_perspective_color="black", own_repertoir=False)
        
        # Load just one game manually to trace where stats go
        player_dir = os.path.join("players", "Hikaru_Nakamura", "pgn")
        test_file = os.path.join(player_dir, "Hikaru_Nakamura_game_1.pgn")
        
        with open(test_file, 'r', encoding='utf-8', errors='ignore') as f:
            import chess.pgn
            game = chess.pgn.read_game(f)
            if game:
                headers = game.headers
                print(f"📋 Loading game: {headers.get('White')} vs {headers.get('Black')}, Result: {headers.get('Result')}")
                
                white_elo = int(headers.get("WhiteElo", "0"))
                black_elo = int(headers.get("BlackElo", "0"))
                game_details = dict(headers)
                
                player_color, result_for_player, skip_stats, actual_color, skip_reason = tree._get_player_perspective_color_and_result(
                    headers, "Hikaru_Nakamura", "black")
                
                print(f"   Player color: {player_color}, Result: {result_for_player}, Skip stats: {skip_stats}")
                
                if player_color:
                    tree.add_game_to_tree(game, test_file, player_color, result_for_player, skip_stats, game_details, white_elo, black_elo)
                    
                    print(f"\n🌳 Tree after adding game:")
                    print(f"   Total nodes: {len(tree.nodes)}")
                    
                    # Examine root node
                    root_node = tree.nodes[tree.root_fen]
                    print(f"\n📊 Root node (starting position):")
                    print(f"   Games: {root_node.games}")
                    print(f"   Wins: {root_node.wins}, Draws: {root_node.draws}, Losses: {root_node.losses}")
                    print(f"   Children: {len(root_node.children)}")
                    
                    # Look at first move
                    if root_node.children:
                        first_move_uci = list(root_node.children.keys())[0]
                        first_child = root_node.children[first_move_uci]
                        
                        print(f"\n🎯 First move child node ({first_move_uci}):")
                        print(f"   FEN: {first_child.fen}")
                        print(f"   Move SAN: {first_child.move_san}")
                        print(f"   Games: {first_child.games}")
                        print(f"   Wins: {first_child.wins}, Draws: {first_child.draws}, Losses: {first_child.losses}")
                        print(f"   Children: {len(first_child.children)}")
                        
                        # Look at the actual final node where the game ends
                        print(f"\n🔎 Searching for nodes with actual game stats...")
                        nodes_with_games = [(fen, node) for fen, node in tree.nodes.items() if node.games > 0]
                        print(f"   Found {len(nodes_with_games)} nodes with games > 0")
                        
                        for i, (fen, node) in enumerate(nodes_with_games[:5]):  # Show first 5
                            print(f"   Node {i+1}: Games={node.games}, W={node.wins}, D={node.draws}, L={node.losses}")
                            print(f"            Move SAN: {node.move_san}, Children: {len(node.children)}")
                            print(f"            FEN: {fen[:50]}...")
                            if node.draws > 0:
                                print(f"            🟡 THIS NODE HAS DRAWS!")
                    
    except Exception as e:
        print(f"❌ Error in tree structure debug: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_tree_structure()
