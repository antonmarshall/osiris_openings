#!/usr/bin/env python3
"""
Test script to verify move validation fixes
"""
import requests
import json

BASE_URL = "http://localhost:8000"

def test_illegal_move():
    """Test adding an illegal move to see if we get proper error handling"""
    print("🧪 Testing illegal move validation...")
    
    # Try to add "a5" as a first move from starting position - this should be legal
    response = requests.post(f"{BASE_URL}/api/add_opening_line", 
        json={
            "player_name": "white_repertoir",
            "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "moves_san": ["a5"],  # This is actually legal! Let's test this first
            "color": "white"
        }
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    # Now test an actually illegal move
    print("\n🧪 Testing actually illegal move...")
    response = requests.post(f"{BASE_URL}/api/add_opening_line", 
        json={
            "player_name": "white_repertoir", 
            "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "moves_san": ["Kh1"],  # King cannot move to h1 from starting position
            "color": "white"
        }
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")

def test_legal_move():
    """Test adding a legal move to make sure normal functionality works"""
    print("\n🧪 Testing legal move...")
    
    response = requests.post(f"{BASE_URL}/api/add_opening_line", 
        json={
            "player_name": "white_repertoir",
            "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "moves_san": ["e4"],  # This should definitely be legal
            "color": "white"
        }
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")

if __name__ == "__main__":
    test_illegal_move()
    test_legal_move()
