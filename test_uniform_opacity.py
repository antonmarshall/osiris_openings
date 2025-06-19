#!/usr/bin/env python3
"""
Test script for uniform arrow opacity feature
"""

import requests
import json
import time

BASE_URL = "http://localhost:8000"

def test_uniform_opacity():
    print("🧪 Testing uniform arrow opacity feature...")
    
    # 1. Test getting current arrow settings
    print("\n1. Getting current arrow settings...")
    try:
        response = requests.get(f"{BASE_URL}/api/get_arrow_settings")
        if response.status_code == 200:
            settings = response.json()
            print(f"✅ Current settings: {json.dumps(settings, indent=2)}")
        else:
            print(f"❌ Failed to get settings: {response.status_code}")
            return
    except Exception as e:
        print(f"❌ Error getting settings: {e}")
        return
    
    # 2. Test setting uniform opacity to True
    print("\n2. Setting uniform opacity to True...")
    try:
        response = requests.post(f"{BASE_URL}/api/set_arrow_opacity", 
                               json={"uniform": True})
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Opacity set to uniform: {json.dumps(result, indent=2)}")
        else:
            print(f"❌ Failed to set opacity: {response.status_code}")
            return
    except Exception as e:
        print(f"❌ Error setting opacity: {e}")
        return
    
    # 3. Test getting moves with uniform opacity
    print("\n3. Testing moves with uniform opacity...")
    starting_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    try:
        response = requests.post(f"{BASE_URL}/api/get_moves", 
                               json={"fen": starting_fen, "player": "Magnus_Carlsen"})
        if response.status_code == 200:
            moves_data = response.json()
            print(f"✅ Got {len(moves_data.get('moves', []))} moves")
            
            # Check if all moves have the same opacity when uniform is enabled
            moves = moves_data.get('moves', [])
            if moves:
                opacities = [move.get('opacity', 0) for move in moves]
                unique_opacities = set(opacities)
                print(f"📊 Move opacities: {opacities}")
                print(f"📊 Unique opacities: {unique_opacities}")
                
                if len(unique_opacities) == 1:
                    print("✅ All moves have uniform opacity (as expected)")
                else:
                    print("⚠️  Moves have different opacities")
        else:
            print(f"❌ Failed to get moves: {response.status_code}")
    except Exception as e:
        print(f"❌ Error getting moves: {e}")
    
    # 4. Test setting uniform opacity to False
    print("\n4. Setting uniform opacity to False...")
    try:
        response = requests.post(f"{BASE_URL}/api/set_arrow_opacity", 
                               json={"uniform": False})
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Opacity set to variable: {json.dumps(result, indent=2)}")
        else:
            print(f"❌ Failed to set opacity: {response.status_code}")
            return
    except Exception as e:
        print(f"❌ Error setting opacity: {e}")
        return
    
    # 5. Test getting moves with variable opacity
    print("\n5. Testing moves with variable opacity...")
    try:
        response = requests.post(f"{BASE_URL}/api/get_moves", 
                               json={"fen": starting_fen, "player": "Magnus_Carlsen"})
        if response.status_code == 200:
            moves_data = response.json()
            print(f"✅ Got {len(moves_data.get('moves', []))} moves")
            
            # Check if moves have different opacities when uniform is disabled
            moves = moves_data.get('moves', [])
            if moves:
                opacities = [move.get('opacity', 0) for move in moves]
                unique_opacities = set(opacities)
                print(f"📊 Move opacities: {opacities}")
                print(f"📊 Unique opacities: {unique_opacities}")
                
                if len(unique_opacities) > 1:
                    print("✅ Moves have variable opacity (as expected)")
                else:
                    print("⚠️  All moves have same opacity (might be coincidence)")
        else:
            print(f"❌ Failed to get moves: {response.status_code}")
    except Exception as e:
        print(f"❌ Error getting moves: {e}")
    
    # 6. Verify final settings
    print("\n6. Verifying final settings...")
    try:
        response = requests.get(f"{BASE_URL}/api/get_arrow_settings")
        if response.status_code == 200:
            settings = response.json()
            print(f"✅ Final settings: {json.dumps(settings, indent=2)}")
        else:
            print(f"❌ Failed to get final settings: {response.status_code}")
    except Exception as e:
        print(f"❌ Error getting final settings: {e}")
    
    print("\n🎯 Uniform opacity test completed!")

if __name__ == "__main__":
    test_uniform_opacity()
