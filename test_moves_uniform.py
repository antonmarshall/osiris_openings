#!/usr/bin/env python3
"""
Test moves with uniform settings
"""

import requests
import json

BASE_URL = "http://localhost:8000"

def test_moves_uniform():
    print("🧪 Testing moves with uniform settings...")
    
    try:        # Test getting moves from starting position
        starting_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        
        print("\n1. Getting moves with current uniform settings...")
        response = requests.post(f"{BASE_URL}/api/find_moves", 
                               json={"fen": starting_fen, "player": "white_repertoir"})
        
        if response.status_code == 200:
            moves_data = response.json()
            moves = moves_data.get('moves', [])
            print(f"✅ Got {len(moves)} moves")
            
            if moves:
                print("\n📊 Move details:")
                thicknesses = []
                opacities = []
                
                for move in moves:
                    thickness = move.get('thickness', 0)
                    opacity = move.get('opacity', 0)
                    thicknesses.append(thickness)
                    opacities.append(opacity)
                    print(f"  {move.get('san', '?')} - Thickness: {thickness}, Opacity: {opacity}, Games: {move.get('games', 0)}")
                
                unique_thicknesses = set(thicknesses)
                unique_opacities = set(opacities)
                
                print(f"\n📈 Analysis:")
                print(f"  Unique thicknesses: {unique_thicknesses}")
                print(f"  Unique opacities: {unique_opacities}")
                
                if len(unique_thicknesses) == 1:
                    print("  ✅ All moves have uniform thickness!")
                else:
                    print("  ❌ Moves have different thicknesses")
                
                if len(unique_opacities) == 1:
                    print("  ✅ All moves have uniform opacity!")
                else:
                    print("  ❌ Moves have different opacities")
        else:
            print(f"❌ Failed to get moves: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_moves_uniform()
