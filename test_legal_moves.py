#!/usr/bin/env python3
"""
Quick test to check legal moves from starting position
"""
import chess

board = chess.Board()
print("Legal moves from starting position:")
legal_moves = [board.san(move) for move in board.legal_moves]
print(f"Total moves: {len(legal_moves)}")
for i, move in enumerate(legal_moves):
    print(f"{i+1:2d}. {move}")
    
print(f"\nIs 'a5' in legal moves? {'a5' in legal_moves}")
print(f"Is 'a4' in legal moves? {'a4' in legal_moves}")
print(f"Is 'a3' in legal moves? {'a3' in legal_moves}")
