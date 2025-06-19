import os
from datetime import datetime
from chess import Board
import chess.pgn
from typing import List, Optional, Tuple
from pathlib import Path
import re

def save_opening_line(player_name: str, start_fen: str, moves_san: list) -> str:
    """
    Speichert eine neue PGN-Datei für eine Opening-Linie.
    Gibt den erzeugten Dateinamen zurück.
    """
    # Zielverzeichnis: players/<player>/pgn
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, 'players', player_name, 'pgn')
    os.makedirs(output_dir, exist_ok=True)
    # Timestamp und SAN-Kette für Dateinamen
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    san_str = '-'.join(moves_san).replace(' ', '_').replace('/', '_')
    file_name = f"{player_name}_opening_{timestamp}_{san_str}.pgn"
    file_path = os.path.join(output_dir, file_name)

    # Prepare PGN game with headers
    date_str = datetime.now().strftime('%Y.%m.%d')
    headers = {
        'Event': 'Opening Training',
        'Site': 'Local',
        'Date': date_str,
        'Round': '1',
        'White': player_name,
        'Black': 'opening_trainer',
        'WhiteElo': '0',
        'BlackElo': '0',
        'ECO': '-'
    }
    # Create PGN Game object
    game = chess.pgn.Game()
    game.headers.update(headers)
    # If start position is not standard, include SetUp and FEN
    default_fen = Board().fen()
    if start_fen != default_fen:
        game.headers['SetUp'] = '1'
        game.headers['FEN'] = start_fen    # Build moves
    board = Board(start_fen)
    node = game
    for i, san in enumerate(moves_san):
        try:
            move = board.parse_san(san)
            board.push(move)
            node = node.add_variation(move)
        except Exception as e:
            legal_moves = [board.san(move) for move in board.legal_moves]
            raise ValueError(f"Illegal move '{san}' at position {i+1} from FEN {board.fen()}. Legal moves: {', '.join(legal_moves[:10])}{'...' if len(legal_moves) > 10 else ''}")
    # Set result
    game.headers['Result'] = '*'
    # Write PGN to file
    with open(file_path, 'w', encoding='utf-8') as f:
        exporter = chess.pgn.FileExporter(f)
        game.accept(exporter)

    return file_name

def find_related_files(player_name: str, moves_san: List[str]) -> List[Tuple[str, List[str]]]:
    """
    Findet alle PGN-Dateien die mit denselben Anfangszügen beginnen.
    Returns: List of (filename, moves_in_file)
    """
    pgn_dir = Path("players") / player_name / "pgn"
    if not pgn_dir.exists():
        return []
    
    related_files = []
    new_moves_str = "-".join(moves_san).lower()
    
    for pgn_file in pgn_dir.glob("*.pgn"):
        # Parse filename um Züge zu extrahieren
        # Format: player_opening_YYYYMMDD_HHMMSS_move1-move2-move3.pgn
        filename = pgn_file.stem
        parts = filename.split('_')
        if len(parts) >= 4 and parts[1] == "opening":
            moves_part = "_".join(parts[4:])  # Alles nach dem Timestamp
            file_moves = moves_part.split('-')
            
            # Prüfe ob die Datei mit unseren Anfangszügen beginnt oder umgekehrt
            if is_prefix_match(file_moves, moves_san) or is_prefix_match(moves_san, file_moves):
                related_files.append((str(pgn_file), file_moves))
    
    return related_files

def is_prefix_match(moves_a: List[str], moves_b: List[str]) -> bool:
    """Prüft ob moves_a ein Prefix von moves_b ist (oder umgekehrt)"""
    if not moves_a or not moves_b:
        return False
    
    shorter = moves_a if len(moves_a) <= len(moves_b) else moves_b
    longer = moves_b if len(moves_a) <= len(moves_b) else moves_a
    
    # Normalisiere für Vergleich (lowercase)
    shorter_norm = [move.lower() for move in shorter]
    longer_norm = [move.lower() for move in longer[:len(shorter)]]
    
    return shorter_norm == longer_norm

def is_simple_extension(existing_moves: List[str], new_moves: List[str]) -> bool:
    """
    Prüft ob new_moves eine direkte Verlängerung von existing_moves ist
    (nicht eine Verzweigung)
    """
    if len(new_moves) <= len(existing_moves):
        return False  # Neue Linie muss länger sein
    
    # Prüfe ob alle existing_moves am Anfang von new_moves stehen
    existing_norm = [move.lower() for move in existing_moves]
    new_prefix = [move.lower() for move in new_moves[:len(existing_moves)]]
    
    return existing_norm == new_prefix

def find_files_to_replace(related_files: List[Tuple[str, List[str]]], new_moves: List[str]) -> List[str]:
    """
    Findet Dateien die durch die neue Linie ersetzt werden sollten.
    Nur kürzere Linien die direkte Prefixes sind.
    """
    files_to_replace = []
    
    for file_path, file_moves in related_files:
        if is_simple_extension(file_moves, new_moves):
            files_to_replace.append(file_path)
    
    return files_to_replace

def safe_replace_files(files_to_replace: List[str], player_name: str, start_fen: str, moves_san: List[str]) -> str:
    """
    Atomic operation: Backup → Delete old files → Create new file → Cleanup
    """
    # 1. Erstelle Backup-Info (für Rollback)
    backup_info = []
    for file_path in files_to_replace:
        if os.path.exists(file_path):
            backup_path = file_path + ".backup"
            os.rename(file_path, backup_path)
            backup_info.append((file_path, backup_path))
    
    try:
        # 2. Erstelle neue Datei
        new_file = save_opening_line(player_name, start_fen, moves_san)
        
        # 3. Wenn erfolgreich, lösche Backups
        for _, backup_path in backup_info:
            if os.path.exists(backup_path):
                os.remove(backup_path)
        
        return new_file
        
    except Exception as e:
        # 4. Rollback bei Fehler
        for original_path, backup_path in backup_info:
            if os.path.exists(backup_path):
                os.rename(backup_path, original_path)
        raise e

def smart_save_opening_line(player_name: str, start_fen: str, moves_san: List[str]) -> Tuple[str, List[str]]:
    """
    Intelligente Speicherung: Ersetzt kürzere Dateien wenn neue Linie eine Verlängerung ist.
    Returns: (new_filename, list_of_replaced_files)
    """
    # 1. Finde verwandte Dateien
    related_files = find_related_files(player_name, moves_san)
    
    # 2. Bestimme welche Dateien ersetzt werden sollen
    files_to_replace = find_files_to_replace(related_files, moves_san)
    
    # 3. Führe sichere Ersetzung durch
    if files_to_replace:
        new_file = safe_replace_files(files_to_replace, player_name, start_fen, moves_san)
        return new_file, files_to_replace
    else:
        # Keine Ersetzung nötig, erstelle einfach neue Datei
        new_file = save_opening_line(player_name, start_fen, moves_san)
        return new_file, []

# CLI-Schnittstelle bleibt fürs Debugging erhalten
if __name__ == '__main__':
    import sys
    if len(sys.argv) < 4:
        print('Usage: python add_opening_lines.py <player_name> <start_fen> <move1> [<move2> ...]')
        sys.exit(1)
    player_name = sys.argv[1]
    start_fen = sys.argv[2]
    moves_san = sys.argv[3:]
    fname = save_opening_line(player_name, start_fen, moves_san)
    print(f'Created {fname}')
