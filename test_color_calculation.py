#!/usr/bin/env python3
"""
Test script to verify the new modular color calculation for moves.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from opening_tree import Node, OpeningTree

def test_color_calculation():
    """Test the new get_move_color method"""
    print("🎨 Testing Color Calculation")
    print("=" * 50)
    
    # Test repertoire colors
    print("\n📚 REPERTOIRE MOVES (should be green):")
    repertoire_node = Node("test_fen")
    repertoire_node.games = 10
    repertoire_node.wins = 7
    repertoire_node.draws = 2
    repertoire_node.losses = 1
    
    repertoire_color = repertoire_node.get_move_color(is_repertoire=True)
    print(f"Repertoire color: {repertoire_color} (expected: #4caf50)")
    
    # Test performance-based colors
    print("\n📊 PERFORMANCE-BASED COLORS:")
    
    test_cases = [
        {"wins": 8, "draws": 1, "losses": 1, "desc": "Excellent (80%)", "expected_range": "Green"},
        {"wins": 6, "draws": 2, "losses": 2, "desc": "Good (60%)", "expected_range": "Light Green"},
        {"wins": 5, "draws": 0, "losses": 5, "desc": "Average (50%)", "expected_range": "Yellow"},
        {"wins": 4, "draws": 0, "losses": 6, "desc": "Below Average (40%)", "expected_range": "Orange"},
        {"wins": 2, "draws": 0, "losses": 8, "desc": "Poor (20%)", "expected_range": "Red"},
        {"wins": 0, "draws": 0, "losses": 0, "desc": "No Data", "expected_range": "Gray"},
    ]
    
    for case in test_cases:
        node = Node("test_fen")
        node.games = case["wins"] + case["draws"] + case["losses"]
        node.wins = case["wins"]
        node.draws = case["draws"]
        node.losses = case["losses"]
        
        win_rate = node.get_win_rate()
        color = node.get_move_color(is_repertoire=False)
        
        print(f"  {case['desc']:<20} | Win Rate: {win_rate:5.1f}% | Color: {color} | {case['expected_range']}")
    
    # Test static method for consistency
    print("\n🔧 STATIC METHOD TEST:")
    static_colors = [
        (70.0, "Excellent"),
        (60.0, "Good"), 
        (50.0, "Average"),
        (40.0, "Below Average"),
        (25.0, "Poor")
    ]
    
    for win_rate, desc in static_colors:
        static_color = OpeningTree.result_rates_to_color(win_rate)
        print(f"  {desc:<15} ({win_rate:4.1f}%) | Static Color: {static_color}")
    
    print("\n✅ Color calculation test completed!")

if __name__ == "__main__":
    test_color_calculation()
