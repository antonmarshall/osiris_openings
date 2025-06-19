#!/usr/bin/env python3
"""Quick test to verify the backend is working"""

import requests
import json

BASE_URL = "http://localhost:8000"

print("=== Quick Backend Test ===")

# Test 1: Check if server is running
try:
    response = requests.get(f"{BASE_URL}/api/players", timeout=5)
    print(f"✅ Server is running: {response.status_code}")
    print(f"   Available players: {response.json()}")
except Exception as e:
    print(f"❌ Server not reachable: {e}")
    exit(1)

# Test 2: Test find_moves for start position
def test_find_moves():
    """Test that find_moves works for the startup position"""
    print("🔍 Testing /api/find_moves for starting position...")
    
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    
    response = requests.post(f"{BASE_URL}/api/find_moves", 
                           json={
                               "fen": fen,
                               "player": "white_repertoir", 
                               "color": "white"
                           })
    
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Success: {data.get('success')}")
        print(f"Number of moves: {len(data.get('moves', []))}")
        print(f"Capabilities: {data.get('capabilities')}")
        
        for move in data.get('moves', []):
            print(f"  - {move.get('san')} | Games: {move.get('games')} | Win%: {move.get('win_rate')}")
        
        return True
    else:
        print(f"Error: {response.text}")
        return False

if __name__ == "__main__":
    test_find_moves()
