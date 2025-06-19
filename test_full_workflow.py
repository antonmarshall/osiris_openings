#!/usr/bin/env python3
"""
Test uniform arrows by using the API endpoints
"""

import requests
import json

BASE_URL = "http://localhost:8000"

def test_full_workflow():
    print("🧪 Testing full uniform arrows workflow...")
    
    try:
        # 1. First set the player
        print("\n1. Setting player to white_repertoir...")
        response = requests.post(f"{BASE_URL}/api/filter_games", 
                               json={"player": "white_repertoir", "color": "white"})
        if response.status_code == 200:
            print("✅ Player set successfully")
        else:
            print(f"❌ Failed to set player: {response.status_code}")
            return
        
        # 2. Get moves with variable settings (turn off uniform)
        print("\n2. Setting uniform settings to False (variable)...")
        requests.post(f"{BASE_URL}/api/set_arrow_thickness", json={"uniform": False})
        requests.post(f"{BASE_URL}/api/set_arrow_opacity", json={"uniform": False})
        
        print("\n3. Getting moves with variable settings...")
        response = requests.post(f"{BASE_URL}/api/find_moves", 
                               json={"fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"})
        
        variable_moves = []
        if response.status_code == 200:
            moves_data = response.json()
            variable_moves = moves_data.get('moves', [])
            print(f"✅ Got {len(variable_moves)} moves with variable settings")
            
            if variable_moves:
                print("  Variable settings:")
                for move in variable_moves:
                    print(f"    {move.get('san')} - Thickness: {move.get('thickness')}, Opacity: {move.get('opacity')}, Games: {move.get('games')}")
        
        # 3. Now set uniform settings
        print("\n4. Setting uniform settings to True...")
        requests.post(f"{BASE_URL}/api/set_arrow_thickness", json={"uniform": True})
        requests.post(f"{BASE_URL}/api/set_arrow_opacity", json={"uniform": True})
        
        print("\n5. Getting moves with uniform settings...")
        response = requests.post(f"{BASE_URL}/api/find_moves", 
                               json={"fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"})
        
        if response.status_code == 200:
            moves_data = response.json()
            uniform_moves = moves_data.get('moves', [])
            print(f"✅ Got {len(uniform_moves)} moves with uniform settings")
            
            if uniform_moves:
                print("  Uniform settings:")
                thicknesses = []
                opacities = []
                
                for move in uniform_moves:
                    thickness = move.get('thickness', 0)
                    opacity = move.get('opacity', 0)
                    thicknesses.append(thickness)
                    opacities.append(opacity)
                    print(f"    {move.get('san')} - Thickness: {thickness}, Opacity: {opacity}, Games: {move.get('games')}")
                
                # Check if all values are the same
                unique_thicknesses = set(thicknesses)
                unique_opacities = set(opacities)
                
                print(f"\n📈 Results:")
                print(f"  Unique thicknesses: {unique_thicknesses}")
                print(f"  Unique opacities: {unique_opacities}")
                
                if len(unique_thicknesses) == 1:
                    print("  ✅ SUCCESS: All moves have uniform thickness!")
                else:
                    print("  ❌ FAIL: Moves have different thicknesses")
                
                if len(unique_opacities) == 1:
                    print("  ✅ SUCCESS: All moves have uniform opacity!")
                else:
                    print("  ❌ FAIL: Moves have different opacities")
        else:
            print(f"❌ Failed to get uniform moves: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_full_workflow()
