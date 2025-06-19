#!/usr/bin/env python3
import requests
import json

# Test API direkt
url = "http://localhost:8000/api/get_moves"
params = {
    "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1"
}

try:
    print("🌐 Making API request...")
    response = requests.get(url, params=params)
    print(f"📊 Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Success! Found {len(data.get('moves', []))} moves")
        
        # Zeige erste 3 Züge im Detail
        for i, move in enumerate(data.get('moves', [])[:3]):
            print(f"\n{i+1}. {move.get('san', 'unknown')}:")
            print(f"   games: {move.get('games', 'missing')}")
            print(f"   wins: {move.get('wins', 'missing')}")
            print(f"   draws: {move.get('draws', 'missing')}")
            print(f"   losses: {move.get('losses', 'missing')}")
            print(f"   win_rate: {move.get('win_rate', 'missing')}")
            print(f"   draw_rate: {move.get('draw_rate', 'missing')}")
            print(f"   lose_rate: {move.get('lose_rate', 'missing')}")
    else:
        print(f"❌ Error: {response.text}")
        
except Exception as e:
    print(f"❌ Exception: {e}")
