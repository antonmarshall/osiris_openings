#!/usr/bin/env python3
"""
Debug-Script um Remis-Daten in Opening Tree zu überprüfen
"""
import sys
import os
sys.path.append(os.path.dirname(__file__))

from opening_tree import OpeningTree

def test_draw_data():
    print("🔍 Testing draw data in Opening Tree...")
    
    # Lade Magnus Carlsen als Spieler
    tree = OpeningTree(player_name="Magnus_Carlsen", initial_perspective_color="white")
    
    # Lade PGN-Dateien
    pgn_dir = "download/players/Magnus_Carlsen/pgn"
    if not os.path.exists(pgn_dir):
        print(f"❌ PGN directory not found: {pgn_dir}")
        return
        
    pgn_files = [f for f in os.listdir(pgn_dir) if f.endswith('.pgn')][:10]  # Nur erste 10 Dateien
    print(f"📂 Found {len(pgn_files)} PGN files (processing first 10)")
    
    for pgn_file in pgn_files:
        pgn_path = os.path.join(pgn_dir, pgn_file)
        print(f"📖 Processing: {pgn_file}")
        tree.load_pgn(pgn_path)
    
    # Hole Züge von der Startposition
    print("\n🏁 Getting moves from starting position...")
    moves_data = tree.get_moves_from_position(tree.root_fen, perspective_color_str="white")
    moves = moves_data.get('moves', [])
    
    print(f"🎯 Found {len(moves)} moves from starting position")
    
    for i, move in enumerate(moves[:5]):  # Erste 5 Züge
        san = move.get('san', 'unknown')
        games = move.get('games', 0)
        wins = move.get('wins', 0)
        draws = move.get('draws', 0)
        losses = move.get('losses', 0)
        win_rate = move.get('win_rate', 0)
        draw_rate = move.get('draw_rate', 0)
        lose_rate = move.get('lose_rate', 0)
        
        print(f"\n{i+1}. {san}:")
        print(f"   Games: {games}")
        print(f"   W/D/L: {wins}/{draws}/{losses}")
        print(f"   Rates: win={win_rate}% draw={draw_rate}% loss={lose_rate}%")
        
        # Berechne erwartete Prozentsätze
        total = wins + draws + losses
        if total > 0:
            expected_win = (wins / total) * 100
            expected_draw = (draws / total) * 100
            expected_loss = (losses / total) * 100
            print(f"   Expected: win={expected_win:.1f}% draw={expected_draw:.1f}% loss={expected_loss:.1f}%")

if __name__ == "__main__":
    test_draw_data()
