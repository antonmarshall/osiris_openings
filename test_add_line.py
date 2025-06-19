#!/usr/bin/env python3

import requests
import json

# Test das add_opening_line endpoint
BASE_URL = "http://localhost:8000"

def test_add_line():
    print("🧪 Testing add_opening_line endpoint...")
    
    # Test 1: Einfacher Zug von Startposition
    print("\n1️⃣ Test 1: e4 von Startposition")
    response = requests.post(f"{BASE_URL}/api/add_opening_line", 
        headers={'Content-Type': 'application/json'},
        json={
            "player_name": "white_repertoir",
            "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "moves_san": ["e4"],
            "color": "white"
        })
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    # Test 2: Zwei Züge von Startposition
    print("\n2️⃣ Test 2: e4 c5 von Startposition")
    response = requests.post(f"{BASE_URL}/api/add_opening_line", 
        headers={'Content-Type': 'application/json'},
        json={
            "player_name": "white_repertoir",
            "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "moves_san": ["e4", "c5"],
            "color": "white"
        })
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")

if __name__ == "__main__":
    test_add_line()
