#!/usr/bin/env python3
"""
Einfacher Test um Remis-Daten direkt im Backend zu überprüfen
"""
import os
import sys
import chess.pgn

# Füge den aktuellen Ordner zum Python-Pfad hinzu
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from opening_tree import OpeningTree

def test_remis_backend():
    print("🔍 Testing Remis data in backend...")
    
    # Erstelle einen neuen OpeningTree
    tree = OpeningTree(player_name="Magnus_Carlsen", initial_perspective_color="white")
    
    # Teste mit einer einzelnen PGN-Datei, die wir kennen (Remis)
    test_pgn = "download/players/Magnus_Carlsen/pgn/Magnus_Carlsen_game_1.pgn"
    
    if not os.path.exists(test_pgn):
        print(f"❌ Test PGN file not found: {test_pgn}")
        # Versuche alternative Pfade
        alt_paths = [
            "players/Magnus_Carlsen/pgn/Magnus_Carlsen_game_1.pgn",
            "data/pgn/Magnus_Carlsen/Magnus_Carlsen_game_1.pgn"
        ]
        for alt_path in alt_paths:
            if os.path.exists(alt_path):
                test_pgn = alt_path
                print(f"✅ Found alternative: {test_pgn}")
                break
        else:
            print("❌ No PGN files found. Listing available files...")
            # Schaue nach verfügbaren PGN-Dateien
            for root, dirs, files in os.walk("."):
                for file in files:
                    if "Magnus_Carlsen" in file and file.endswith(".pgn"):
                        print(f"📁 Found: {os.path.join(root, file)}")
            return
    
    print(f"📖 Testing with: {test_pgn}")
    
    # Lese die PGN-Datei und überprüfe das Ergebnis
    with open(test_pgn, 'r') as f:
        game = chess.pgn.read_game(f)
        if game:
            headers = game.headers
            result = headers.get("Result", "*")
            white = headers.get("White", "")
            black = headers.get("Black", "")
            print(f"🏁 Game result: {result}")
            print(f"⚪ White: {white}")
            print(f"⚫ Black: {black}")
            
            # Bestimme, welche Farbe Magnus spielt
            magnus_color = "white" if "Carlsen" in white else "black" if "Carlsen" in black else "unknown"
            print(f"👑 Magnus plays: {magnus_color}")
            
            if result == "1/2-1/2":
                print("✅ This is a DRAW game!")
            elif result == "1-0":
                print("⚪ White wins")
            elif result == "0-1":
                print("⚫ Black wins")
            else:
                print(f"❓ Unknown result: {result}")
    
    # Lade die PGN in den Tree
    print(f"\n📊 Loading PGN into tree...")
    tree.load_pgn(test_pgn)
    
    # Überprüfe Root-Node-Statistiken
    root_node = tree.nodes.get(tree.root_fen)
    if root_node:
        print(f"\n🌳 Root node stats:")
        print(f"   Total games: {root_node.games}")
        print(f"   Wins: {root_node.wins}")
        print(f"   Draws: {root_node.draws}")
        print(f"   Losses: {root_node.losses}")
        print(f"   Win rate: {root_node.get_win_rate():.1f}%")
        
        # Überprüfe erste Züge
        print(f"\n🎯 First moves from root:")
        for uci, child_node in list(root_node.children.items())[:3]:
            move_san = child_node.move_san or uci
            print(f"   {move_san}: {child_node.games} games, {child_node.wins}W {child_node.draws}D {child_node.losses}L")
    else:
        print("❌ No root node found!")
    
    # Teste die API-Methode
    print(f"\n🔌 Testing API method...")
    moves_data = tree.get_moves_from_position(tree.root_fen, perspective_color_str="white")
    moves = moves_data.get('moves', [])
    
    print(f"📦 API returned {len(moves)} moves:")
    for i, move in enumerate(moves[:3]):
        san = move.get('san', 'unknown')
        games = move.get('games', 0)
        wins = move.get('wins', 0)
        draws = move.get('draws', 0)
        losses = move.get('losses', 0)
        win_rate = move.get('win_rate', 0)
        draw_rate = move.get('draw_rate', 0)
        lose_rate = move.get('lose_rate', 0)
        
        print(f"   {i+1}. {san}: {games} games")
        print(f"      Raw: {wins}W {draws}D {losses}L")
        print(f"      Rates: win={win_rate:.1f}% draw={draw_rate:.1f}% loss={lose_rate:.1f}%")

if __name__ == "__main__":
    test_remis_backend()
