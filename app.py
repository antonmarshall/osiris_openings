import os
os.system('cls' if os.name == 'nt' else 'clear')

# horus_openings – FastAPI Backend
# ----------------------------------
# - Stellt API für Schacheröffnungs-Visualisierung bereit
# - Lädt und analysiert PGN-Dateien, baut OpeningTree
# - Liefert Daten für das Frontend (Spieler, Züge, Statistiken)
#
# Hauptkomponenten:
#   - OpeningTree: Baumstruktur für Schachstellungen/Züge
#   - API-Endpunkte: Spieler laden, Züge/Statistiken abfragen
#
# Hinweise:
#   - Nur Backend-Logik, keine Visualisierung!
#   - Siehe opening_tree.py für Baumstruktur

from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form, Body, BackgroundTasks
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from opening_tree import OpeningTree, Node
import os
import subprocess
from typing import List, Dict, Any
import shutil
from fastapi.middleware.cors import CORSMiddleware
import logging
import asyncio
import time
from pathlib import Path
import chess.pgn
import json
import uuid
import traceback
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response as StarletteResponse
from download.save_all_game_links import main as save_links_main
from download.download_all_pgn import ChessGameDownloader
from add_opening_lines import save_opening_line, smart_save_opening_line
from chess import Board, Move

# Logging konfigurieren - Strukturiert für Entwickler
import time
from datetime import datetime

class DevLogger:
    @staticmethod
    def function_start(func_name, **kwargs):
        """Funktion startet - mit Parametern"""
        params = ", ".join([f"{k}={v}" for k, v in kwargs.items()])
        logger.info(f"🟢 START {func_name}({params})")
        return time.time()
    
    @staticmethod  
    def function_end(func_name, start_time, **kwargs):
        """Funktion beendet - mit Timing und Ergebnis"""
        duration = time.time() - start_time
        result = ", ".join([f"{k}={v}" for k, v in kwargs.items()])
        logger.info(f"✅ END   {func_name} | {duration:.2f}s | {result}")
    
    @staticmethod
    def function_error(func_name, error, **kwargs):
        """Funktion fehlgeschlagen - mit Context"""
        context = ", ".join([f"{k}={v}" for k, v in kwargs.items()])
        logger.error(f"❌ ERROR {func_name} | {error} | Context: {context}")
    
    @staticmethod
    def data_summary(operation, **stats):
        """Daten-Zusammenfassung - übersichtlich"""
        stats_str = ", ".join([f"{k}={v}" for k, v in stats.items()])
        logger.info(f"📊 DATA  {operation} | {stats_str}")
    
    @staticmethod
    def state_change(old_state, new_state, trigger):
        """State-Änderung - für Debugging"""
        logger.info(f"🔄 STATE {trigger} | {old_state} → {new_state}")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Lifespan Event Handler (moderne Alternative zu on_event)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await startup_event()
    yield
    # Shutdown (falls nötig)
    pass

async def startup_event():
    """Lädt beim Start optional einen Standardspieler - konfigurierbar über LOAD_DEFAULT_PLAYER."""
    global current_player, opening_tree
    
    # Ensure repertoire directories exist on startup
    log_section("Backend-Startup: Prüfe Repertoire-Ordner")
    ensure_repertoire_directories()
    
    if not LOAD_DEFAULT_PLAYER:
        log_section("Backend-Startup: Bereit für Spielerauswahl")
        logger.info("👤 Default-Player deaktiviert - Benutzer muss manuell einen Spieler wählen")
        logger.info("🔧 Um Default-Player zu aktivieren: LOAD_DEFAULT_PLAYER = True setzen")
        return
    
    try:
        log_section("Backend-Startup: Initialisiere Standardspieler")
        current_player = "Hikaru_Nakamura"
        logger.info(f"👤 Spieler: {current_player}")
        player_dir = os.path.join(PGN_BASE_DIR, current_player, "pgn")
        if not os.path.exists(player_dir):
            logger.error(f"❌ PGN-Ordner nicht gefunden: {player_dir}")
            return
        logger.info(f"📁 PGN-Ordner gefunden: {player_dir}")
        pgn_files = [f for f in os.listdir(player_dir) if f.endswith('.pgn')]
        logger.info(f"📄 Gefundene PGN-Dateien: {len(pgn_files)}")
        opening_tree = OpeningTree(current_player, initial_perspective_color='black', own_repertoir=(current_player in REPERTOIRE_PLAYERS))
        logger.info("🌳 OpeningTree initialisiert")
        logger.info(f"⏳ Starte PGN-Laden aus: {player_dir}")
        
        # Use consolidated PGN loading function
        load_stats = _load_pgns_for_player(current_player, player_dir, opening_tree, detailed_logging=True)
        
        # Show tree structure if successfully loaded
        if load_stats['games_loaded'] > 0:
            logger.info(f"🌳 Tree-Nodes erstellt: {len(opening_tree.nodes)}")
            opening_tree.print_tree(max_depth=4, max_children=8)
        
        logger.info("✅ Backend-Startup abgeschlossen.")
    except Exception as e:
        logger.error(f"❌ Fehler beim Laden der Standarddaten: {e}")

# FastAPI-App erstellen mit Lifespan
app = FastAPI(lifespan=lifespan)

# CORS Middleware (für lokale Entwicklung und Browser-Frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request Logging Middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    # Log incoming request
    logger.info(f"🌐 [{request.method}] {request.url.path} - Client: {request.client.host if request.client else 'unknown'}")
    
    # Process request
    response = await call_next(request)
    
    # Log response
    process_time = time.time() - start_time
    logger.info(f"🌐 [{request.method}] {request.url.path} - Status: {response.status_code} - Time: {process_time:.3f}s")
    
    return response

# Static Files (Frontend) einbinden
app.mount("/static", StaticFiles(directory="static"), name="static")

# Globale Variable für den aktuellen Spieler und OpeningTree
current_player = None
opening_tree = None

PGN_BASE_DIR = "players"  # Fixed to use actual players directory

# Konfiguration: Default-Player beim Start laden?
LOAD_DEFAULT_PLAYER = False  # True = Hikaru_Nakamura wird automatisch geladen, False = Benutzer muss wählen

# Player Type Detection - Backend Logic
REPERTOIRE_PLAYERS = ["white_repertoir", "black_repertoir"]

def resolve_player_name(frontend_player: str, color: str) -> str:
    """
    Resolve frontend player selection to actual backend player name.
    
    Args:
        frontend_player: Player name from frontend ("My Repertoire" or actual player name)
        color: "white" or "black"
    
    Returns:
        Actual player name for backend processing
    """
    if frontend_player == "My Repertoire":
        return "white_repertoir" if color == "white" else "black_repertoir"
    return frontend_player

def resolve_frontend_player_name(backend_player: str) -> str:
    """
    Resolve backend player name to frontend display name.
    
    Args:
        backend_player: Actual backend player name
        
    Returns:
        Frontend display name
    """
    if backend_player in ["white_repertoir", "black_repertoir"]:
        return "My Repertoire"
    return backend_player

def get_player_type(player_name: str) -> str:
    """Detect if player is repertoire or analysis type"""
    if not player_name:
        return "analysis"
    return "repertoire" if player_name in REPERTOIRE_PLAYERS else "analysis"

def ensure_repertoire_directories():
    """Ensure repertoire directories exist, create them if missing"""
    for repertoire_player in REPERTOIRE_PLAYERS:
        player_dir = os.path.join(PGN_BASE_DIR, repertoire_player)
        pgn_dir = os.path.join(player_dir, "pgn")
        
        if not os.path.exists(pgn_dir):
            logger.info(f"📁 Creating missing repertoire directory: {pgn_dir}")
            os.makedirs(pgn_dir, exist_ok=True)
            
            # Create a basic .gitkeep file to ensure the directory is tracked
            gitkeep_file = os.path.join(pgn_dir, ".gitkeep")
            with open(gitkeep_file, 'w') as f:
                f.write("# This file ensures the repertoire directory is preserved\n")
                
            logger.info(f"✅ Repertoire directory created: {pgn_dir}")
        else:
            logger.debug(f"📁 Repertoire directory exists: {pgn_dir}")

# Fortschritt-Tracking für Downloads
download_progress = {}  # task_id -> {'progress': int, 'status': str, 'error': str}

def set_progress(task_id, progress, status=None, error=None):
    download_progress[task_id] = {
        'progress': progress,
        'status': status or '',
        'error': error or ''
    }

def get_progress(task_id):
    return download_progress.get(task_id, {'progress': 0, 'status': '', 'error': 'Unknown task_id'})

async def background_download_player(player_name, task_id, limit=200):
    player_dir = create_player_directory(player_name)
    try:
        logger.info(f"[DownloadTask {task_id}] Starte Download für Spieler: {player_name} (Limit: {limit})")
        set_progress(task_id, 0, status='initializing')
        # Step 1: Links sammeln
        set_progress(task_id, 5, status='collecting_links')
        cmd_links = ['python', '-m', 'download.save_all_game_links', player_name, str(limit)]
        logger.info(f"[DownloadTask {task_id}] Aufruf: {' '.join(cmd_links)}")
        result = await asyncio.create_subprocess_exec(
            *cmd_links,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        while True:
            if result.stdout.at_eof():
                break
            await asyncio.sleep(0.2)
            set_progress(task_id, 10, status='collecting_links')
        stdout, stderr = await result.communicate()
        logger.info(f"[DownloadTask {task_id}] save_all_game_links.py beendet mit Code {result.returncode}")
        if stdout:
            logger.info(f"[DownloadTask {task_id}] save_all_game_links.py stdout: {stdout.decode(errors='ignore')}")
        if stderr:
            logger.warning(f"[DownloadTask {task_id}] save_all_game_links.py stderr: {stderr.decode(errors='ignore')}")
        if result.returncode != 0:
            set_progress(task_id, 100, status='error', error=stderr.decode())
            logger.error(f"[DownloadTask {task_id}] Fehler beim Links sammeln. Ordner wird gelöscht.")
            shutil.rmtree(os.path.join(PGN_BASE_DIR, player_name), ignore_errors=True)
            return
        set_progress(task_id, 20, status='downloading_pgns')
        # Step 2: PGNs herunterladen
        cmd_pgn = ['python', '-m', 'download.download_all_pgn', player_name, str(limit)]
        logger.info(f"[DownloadTask {task_id}] Aufruf: {' '.join(cmd_pgn)}")
        result2 = await asyncio.create_subprocess_exec(
            *cmd_pgn,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        prog = 20
        while True:
            if result2.stdout.at_eof():
                break
            await asyncio.sleep(0.5)
            prog = min(prog + 10, 90)
            set_progress(task_id, prog, status='downloading_pgns')
        stdout2, stderr2 = await result2.communicate()
        logger.info(f"[DownloadTask {task_id}] download_all_pgn.py beendet mit Code {result2.returncode}")
        if stdout2:
            logger.info(f"[DownloadTask {task_id}] download_all_pgn.py stdout: {stdout2.decode(errors='ignore')}")
        if stderr2:
            logger.warning(f"[DownloadTask {task_id}] download_all_pgn.py stderr: {stderr2.decode(errors='ignore')}")
        if result2.returncode != 0:
            set_progress(task_id, 100, status='error', error=stderr2.decode())
            logger.error(f"[DownloadTask {task_id}] Fehler beim PGN-Download. Ordner wird gelöscht.")
            shutil.rmtree(os.path.join(PGN_BASE_DIR, player_name), ignore_errors=True)
            return
        # Prüfe, ob mindestens eine PGN-Datei existiert
        pgn_dir = os.path.join(PGN_BASE_DIR, player_name, 'pgn')
        pgn_files = [f for f in os.listdir(pgn_dir) if f.endswith('.pgn')] if os.path.exists(pgn_dir) else []
        logger.info(f"[DownloadTask {task_id}] Gefundene PGN-Dateien: {len(pgn_files)}")
        
        if not pgn_files:
            error_message = f"⚠️ Kein einziges Spiel für '{player_name}' gefunden!\n💡 Tipp: Überprüfe den Spielernamen auf chess.com\n🔍 Versuche einen anderen Spielernamen"
            set_progress(task_id, 100, status='error', error=error_message)
            logger.error(f"[DownloadTask {task_id}] Keine PGN-Dateien gefunden. Ordner wird gelöscht.")
            shutil.rmtree(os.path.join(PGN_BASE_DIR, player_name), ignore_errors=True)
            return
            
        # Erfolgreicher Download - detaillierte Info
        player_full_path = os.path.abspath(os.path.join(PGN_BASE_DIR, player_name))
        success_message = f"✅ Download abgeschlossen!\n📁 Spieler: {player_name}\n📂 Pfad: {player_full_path}\n🎮 PGN-Dateien: {len(pgn_files)}"
        
        set_progress(task_id, 100, status='done', message=success_message)
        logger.info(f"[DownloadTask {task_id}] {success_message}")
    except Exception as e:
        tb = traceback.format_exc()
        set_progress(task_id, 100, status='error', error=str(e))
        logger.error(f"[DownloadTask {task_id}] Unerwarteter Fehler: {e}\n{tb}")
        shutil.rmtree(os.path.join(PGN_BASE_DIR, player_name), ignore_errors=True)

# ====== LOGGING HELPERS ======
def log_section(title, icon="🔷"):
    # Removed decorative multi-line banners. Use a single concise log line instead.
    logger.info(f"[STARTUP] {title}")

def log_summary(msg, icon="📊"):
    # Keep as a single concise summary log.
    logger.info(f"{icon} {msg}")

@app.get("/api/DEPRECATED_startup_logic")
async def get_status():
    """Lädt beim Start optional einen Standardspieler - konfigurierbar über LOAD_DEFAULT_PLAYER."""
    global current_player, opening_tree
    
    # Ensure repertoire directories exist on startup
    log_section("Backend-Startup: Prüfe Repertoire-Ordner")
    ensure_repertoire_directories()
    
    # This should never be called as API route - this is startup logic
    return {"error": "This endpoint should not be used"}
    
    try:
        log_section("Backend-Startup: Initialisiere Standardspieler")
        current_player = "Hikaru_Nakamura"
        logger.info(f"👤 Spieler: {current_player}")
        player_dir = os.path.join(PGN_BASE_DIR, current_player, "pgn")
        if not os.path.exists(player_dir):
            logger.error(f"❌ PGN-Ordner nicht gefunden: {player_dir}")
            return
        logger.info(f"📁 PGN-Ordner gefunden: {player_dir}")
        pgn_files = [f for f in os.listdir(player_dir) if f.endswith('.pgn')]
        logger.info(f"📄 Gefundene PGN-Dateien: {len(pgn_files)}")
        opening_tree = OpeningTree(current_player, initial_perspective_color='black', own_repertoir=(current_player in REPERTOIRE_PLAYERS))
        logger.info("🌳 OpeningTree initialisiert")
        logger.info(f"⏳ Starte PGN-Laden aus: {player_dir}")
        
        # Use consolidated PGN loading function
        load_stats = _load_pgns_for_player(current_player, player_dir, opening_tree, detailed_logging=True)
        
        # Show tree structure if successfully loaded
        if load_stats['games_loaded'] > 0:
            logger.info(f"🌳 Tree-Nodes erstellt: {len(opening_tree.nodes)}")
            opening_tree.print_tree(max_depth=4, max_children=8)
        
        logger.info("✅ Backend-Startup abgeschlossen.")
    except Exception as e:
        logger.error(f"❌ Fehler beim Laden der Standarddaten: {e}")

@app.get("/api/status")
async def get_status():
    """Gibt den kompletten Backend-Status zurück - Frontend zeigt nur das an."""
    logger.info("🌐 [GET] /api/status - Request received!")
    global current_player, opening_tree
    try:
        # Get unified player list (with "My Repertoire" instead of individual repertoire players)
        players = await get_players()
        
        # Generate player options for frontend dropdown
        player_options = []
        current_frontend_player = resolve_frontend_player_name(current_player) if current_player else None
        
        for player in players:
            display_name = player.replace('_', ' ')
            player_options.append({
                "value": player,
                "text": display_name,
                "selected": player == current_frontend_player
            })
        
        # Sort by display name
        player_options.sort(key=lambda x: x["text"])
        
        return {
            "current_player": resolve_frontend_player_name(current_player) if current_player else None,
            "current_perspective": opening_tree.current_perspective_color if opening_tree else "white",
            "player_options": player_options,  # Komplette Dropdown-Daten
            "tree_loaded": opening_tree is not None,
            "tree_nodes": len(opening_tree.nodes) if opening_tree else 0,
            "perspective_options": [
                {"value": "white", "text": "Weiß", "selected": (opening_tree.current_perspective_color if opening_tree else "white") == "white"},
                {"value": "black", "text": "Schwarz", "selected": (opening_tree.current_perspective_color if opening_tree else "white") == "black"}
            ]
        }
    except Exception as e:
        logger.error(f"Fehler in /status: {e}")
        return {
            "current_player": None,
            "current_perspective": "white", 
            "player_options": [],
            "perspective_options": [
                {"value": "white", "text": "Weiß", "selected": True},
                {"value": "black", "text": "Schwarz", "selected": False}
            ],
            "tree_loaded": False,
            "tree_nodes": 0,
            "error": str(e)
        }

@app.get("/", response_class=HTMLResponse)
def serve_index():
    """Gibt die Hauptseite (Frontend HTML) zurück."""
    return FileResponse("static/index.html")

@app.get("/api/players")
async def get_players():
    try:
        # Ensure repertoire directories exist before listing players
        ensure_repertoire_directories()
        
        players_dir = Path("players")
        if not players_dir.exists():
            logger.info(f"📁 Players directory wird erstellt: {players_dir.absolute()}")
            players_dir.mkdir(exist_ok=True)
            logger.info(f"✅ Leeres Players-Verzeichnis bereit für neue Downloads")
            return []
            
        logger.info(f"Scanning players directory: {players_dir.absolute()}")
        all_players = [d.name for d in players_dir.iterdir() if d.is_dir()]
        
        # Filter out individual repertoire players and replace with unified entry
        players = []
        has_white_repertoire = "white_repertoir" in all_players
        has_black_repertoire = "black_repertoir" in all_players
        
        # Add unified repertoire entry if any repertoire exists
        if has_white_repertoire or has_black_repertoire:
            players.append("My Repertoire")
        
        # Add all other players (excluding individual repertoire entries)
        for player in all_players:
            if player not in ["white_repertoir", "black_repertoir"]:
                players.append(player)
        
        logger.info(f"Found players (unified): {players}")
        return {"success": True, "players": players}
    except Exception as e:
        logger.error(f"Error getting players: {str(e)}")
        return {"success": False, "players": [], "error": str(e)}

def get_player_list() -> List[str]:
    if not os.path.isdir(PGN_BASE_DIR):
        return []
    return sorted([d for d in os.listdir(PGN_BASE_DIR)
                   if os.path.isdir(os.path.join(PGN_BASE_DIR, d))])

@app.post("/api/download_player")
async def api_download_player(request: Request):
    """Startet den Download-Prozess für einen neuen Spieler (synchron, ohne Subprozess/Progress)."""
    data = await request.json()
    player_name = data.get("player_name")
    limit = int(data.get("limit", 200))
    
    # Log download request
    logger.info(f"⬇️ Download Player requested: '{player_name}' (limit: {limit})")
    
    if not player_name:
        raise HTTPException(status_code=400, detail="Kein Spielername angegeben")
    player_dir = os.path.join(PGN_BASE_DIR, player_name, "pgn")
    if os.path.exists(player_dir) and os.listdir(player_dir):
        return {"success": False, "detail": f"Spieler '{player_name}' existiert bereits!"}
    try:
        # Schritt 1: Links sammeln
        save_links_main(player_name, limit)
        # Schritt 2: PGNs herunterladen
        downloader = ChessGameDownloader(player_name)
        downloader.process_urls(limit)
        
        # Erfolgreicher Download - Pfad-Info hinzufügen
        player_full_path = os.path.abspath(os.path.join(PGN_BASE_DIR, player_name))
        pgn_path = os.path.join(player_full_path, "pgn")
        pgn_count = len([f for f in os.listdir(pgn_path) if f.endswith('.pgn')]) if os.path.exists(pgn_path) else 0
        
        if pgn_count == 0:
            # Warnung bei 0 Dateien
            error_message = f"⚠️ Download für '{player_name}' abgeschlossen, aber keine Spiele gefunden!\n📁 Pfad: {player_full_path}\n💡 Tipp: Überprüfe den Spielernamen auf chess.com"
            logger.warning(f"⬇️ {error_message}")
            
            # Lösche leeren Ordner
            import shutil
            if os.path.exists(player_full_path):
                shutil.rmtree(player_full_path, ignore_errors=True)
                logger.info(f"🗑️ Leerer Spielerordner gelöscht: {player_full_path}")
            
            return {"success": False, "detail": error_message}
        else:
            success_message = f"✅ Download für '{player_name}' abgeschlossen!\n📁 Gespeichert in: {player_full_path}\n🎮 {pgn_count} PGN-Dateien heruntergeladen"
            logger.info(f"⬇️ {success_message}")
            return {"success": True, "detail": success_message}
    except Exception as e:
        logger.error(f"Fehler beim Download für {player_name}: {e}")
        return {"success": False, "detail": str(e)}

@app.get("/api/progress")
async def api_progress(task_id: str):
    """Gibt den aktuellen Fortschritt für einen Task zurück."""
    return get_progress(task_id)

def create_player_directory(player_name: str) -> str:
    """Erstellt einen neuen Spieler-Ordner."""
    player_dir = os.path.join(PGN_BASE_DIR, player_name, "pgn")
    os.makedirs(player_dir, exist_ok=True)
    return player_dir

@app.get("/api/process_games/{player}")
async def process_games(player: str, color: str = 'white'):
    """Verarbeitet die PGNs eines Spielers und gibt die ersten Daten zurück."""
    global current_player, opening_tree
    
    # Resolve frontend player name to actual backend player name
    actual_player = resolve_player_name(player, color)
    logger.info(f"[DEBUG] /api/process_games: player={player}, color={color}, actual_player={actual_player}")
    
    player_dir = os.path.join(PGN_BASE_DIR, actual_player, "pgn")
    if not os.path.isdir(player_dir):
        logger.error(f"❌ PGN-Ordner nicht gefunden: {player_dir}")
        raise HTTPException(status_code=404, detail="Spieler nicht gefunden")
    try:
        log_section(f"API: Prozessiere Spiele für {player} → {actual_player} ({color})", icon="🟦")
        
        # Check if we already have a tree for this player with the same color
        if current_player == actual_player and opening_tree is not None and opening_tree.current_perspective_color == color:
            logger.info(f"✅ OpeningTree für {actual_player} ({color}) bereits geladen - verwende bestehenden Baum")
        else:
            # Only create new tree if player/color is different
            current_player = actual_player
            opening_tree = OpeningTree(player_name=actual_player, initial_perspective_color=color, own_repertoir=(actual_player in REPERTOIRE_PLAYERS))
            logger.info(f"[DEBUG] OpeningTree created: own_repertoir={opening_tree.own_repertoir}, current_perspective_color={opening_tree.current_perspective_color}")
            logger.info(f"🌳 Neuer OpeningTree erstellt für {actual_player} ({color})")
            
            # Load games using centralized function
            load_stats = _load_pgns_for_player(actual_player, player_dir, opening_tree, detailed_logging=True)
            log_summary(f"{load_stats['games_loaded']} Partien verarbeitet und in OpeningTree geladen.")
            # Tree nach dem Laden ausgeben
            opening_tree.print_tree(max_depth=4, max_children=8)
        pgn_texts = []
        for file in os.listdir(player_dir):
            if file.endswith('.pgn'):
                file_path = os.path.join(player_dir, file)
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    pgn_text = f.read()
                    pgn_text = pgn_text.replace('Â½', '1/2')
                    pgn_texts.append(pgn_text)
        data = opening_tree.get_tree_data(opening_tree.root_fen)
        moves_data = opening_tree.get_moves_from_position(opening_tree.root_fen, perspective_color_str=color)
        
        if data is None:
            logger.error(f"❌ Keine Daten für Wurzelknoten ({opening_tree.root_fen}) verfügbar nach PGN-Laden.")
            data = {
                "fen": opening_tree.root_fen,
                "games": 0,
                "wins": 0,
                "draws": 0,
                "losses": 0,
                "children": {},
                "move_san": None,
                "game_info": [],
                "win_rate": 0.0
            }
            logger.info(f"📋 Fallback-Daten für Wurzelknoten {opening_tree.root_fen} (Tree noch leer oder wird initialisiert)")
        
        # Calculate total statistics from child moves for better root position stats
        total_games = sum(move.get('games', 0) for move in moves_data.get('moves', []))
        total_wins = sum(move.get('wins', 0) for move in moves_data.get('moves', []))
        total_draws = sum(move.get('draws', 0) for move in moves_data.get('moves', []))
        total_losses = sum(move.get('losses', 0) for move in moves_data.get('moves', []))
        
        # Use calculated totals if root has no games but children do
        if data.get("games", 0) == 0 and total_games > 0:
            data["games"] = total_games
            data["wins"] = total_wins
            data["draws"] = total_draws
            data["losses"] = total_losses
            data["win_rate"] = (total_wins / total_games * 100) if total_games > 0 else 0.0
            logger.info(f"📊 Calculated root statistics from children: {total_games} games, {data['win_rate']:.1f}% win rate")
        
        logger.info(f"📊 Daten für Wurzelknoten ({opening_tree.root_fen}) abgerufen: Spiele={data.get('games')}, Kinder={len(data.get('children', {}))}")
        response_data = {
            "success": True,
            "position": data["fen"],
            "moves": moves_data.get('moves', []),
            "games": data["games"],
            "win_rate": data.get("win_rate", 0.0),
            "pgn_data": pgn_texts
        }
        logger.info(f"✅ Antwort vorbereitet mit {len(pgn_texts)} PGN-Texten für Wurzelknoten {data['fen']}")
        return response_data
    except Exception as e:
        logger.error(f"❌ Fehler bei der Spielverarbeitung: {str(e)}")
        logger.exception("Detaillierter Fehler:")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/position_stats/{fen}/{player}")
async def get_position_stats(fen: str, player: str):
    """Berechnet Statistiken für eine bestimmte Position eines Spielers."""
    player_dir = os.path.join(PGN_BASE_DIR, player, "pgn")
    if not os.path.isdir(player_dir):
        raise HTTPException(status_code=404, detail="Spieler nicht gefunden")
    
    try:
        games = []
        for file in os.listdir(player_dir):
            if file.endswith('.pgn'):
                with open(os.path.join(player_dir, file), 'r') as f:
                    pgn = chess.pgn.read_game(f)
                    if pgn:
                        games.append(pgn)
        
        stats = {
            'played': 0,
            'won': 0,
            'lost': 0,
            'drawn': 0
        }
        
        for game in games:
            board = chess.Board()
            for move in game.mainline_moves():
                board.push(move)
                if board.fen() == fen:
                    stats['played'] += 1
                    result = game.headers.get('Result', '')
                    if result == '1-0':
                        stats['won'] += 1
                    elif result == '0-1':
                        stats['lost'] += 1
                    else:
                        stats['drawn'] += 1
                    break
        
        return stats
    except Exception as e:
        logger.error(f"Fehler bei der Statistikberechnung: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/next")
async def get_next_moves(fen: str):
    """Gibt die möglichen nächsten Züge für eine Position zurück."""
    global opening_tree
    if not opening_tree:
        raise HTTPException(status_code=500, detail="Kein Spieler ausgewählt")
    
    try:
        data = opening_tree.get_moves_from_position(fen)
        if data is None:
            raise HTTPException(status_code=404, detail="Position nicht gefunden")
        return data
    except Exception as e:
        logger.error(f"Fehler beim Laden der Züge: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/upload_pgns")
async def api_upload_pgns(player_name: str = Form(...), files: List[UploadFile] = File(...)):
    # Zielordner
    player_dir = os.path.join(PGN_BASE_DIR, player_name, "pgn")
    os.makedirs(player_dir, exist_ok=True)
    try:
        for file in files:
            dest = os.path.join(player_dir, file.filename)
            with open(dest, "wb") as f:
                shutil.copyfileobj(file.file, f)
        return {"success": True}
    except Exception as e:
        return JSONResponse({"success": False, "detail": str(e)}, status_code=500)

@app.get("/api/player_games/{player_name}")
async def get_player_games(player_name: str):
    """Gibt eine Liste aller Spiele eines Spielers zurück."""
    player_dir = os.path.join(PGN_BASE_DIR, player_name, "pgn")
    
    if not os.path.exists(player_dir):
        raise HTTPException(status_code=404, detail="Spieler nicht gefunden")
    
    try:
        games = []
        for file in os.listdir(player_dir):
            if file.endswith(".pgn"):
                games.append({
                    "filename": file,
                    "path": os.path.join("pgn", file)
                })
        return sorted(games, key=lambda x: x["filename"])
    except Exception as e:
        logger.error(f"Fehler beim Lesen der Spiele: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def get_player_games(player_name):
    player_dir = os.path.join('players', player_name, 'pgn')
    games = []
    if os.path.exists(player_dir):
        for file in os.listdir(player_dir):
            if file.endswith('.pgn'):
                with open(os.path.join(player_dir, file), 'r') as f:
                    pgn = chess.pgn.read_game(f)
                    if pgn:
                        games.append(pgn)
    return games

def analyze_position(fen, player_games):
    stats = {
        'played': 0,
        'won': 0,
        'lost': 0,
        'drawn': 0
    }
    
    for game in player_games:
        board = chess.Board()
        for move in game.mainline_moves():
            board.push(move)
            if board.fen() == fen:
                stats['played'] += 1
                result = game.headers.get('Result', '')
                if result == '1-0':
                    stats['won'] += 1
                elif result == '0-1':
                    stats['lost'] += 1
                else:
                    stats['drawn'] += 1
                break
    
    return stats

# --- Modularisiere Filter- und Namenslogik ---
def normalize_name(name: str) -> str:
    if not name:
        return ""
    return name.lower().replace("_", " ").strip()

def names_match(a: str, b: str) -> bool:
    if not a or not b:
        return False
    if a == b:
        return True
    a_parts = a.split()
    b_parts = b.split()
    if len(a_parts) == 2 and len(b_parts) == 2:
        return a_parts[0] == b_parts[1] and a_parts[1] == b_parts[0]
    return False

def filter_games(games: List[Dict[str, Any]], player: str, color: str) -> Dict[str, Any]:
    player_norm = normalize_name(player)
    color_norm = normalize_name(color)
    filtered = []
    log = []
    for idx, game in enumerate(games):
        headers = game.get("headers", {})
        white_norm = normalize_name(headers.get("White"))
        black_norm = normalize_name(headers.get("Black"))
        match = False
        reason = ""
        if color_norm == "white":
            if not headers.get("White"):
                reason = "Kein White-Header"
            elif white_norm == player_norm or names_match(white_norm, player_norm):
                match = True
                reason = "White match"
            else:
                reason = f"White stimmt nicht überein: '{headers.get('White')}' vs. '{player}'"
        elif color_norm == "black":
            if not headers.get("Black"):
                reason = "Kein Black-Header"
            elif black_norm == player_norm or names_match(black_norm, player_norm):
                match = True
                reason = "Black match"
            else:
                reason = f"Black stimmt nicht überein: '{headers.get('Black')}' vs. '{player}'"
        else:
            reason = f"Unbekannte Farbe: '{color}'"
        log.append({
            "idx": idx,
            "gesucht": {"player": player, "playerNorm": player_norm, "color": color, "colorNorm": color_norm},
            "header": {"White": headers.get("White"), "whiteNorm": white_norm, "Black": headers.get("Black"), "blackNorm": black_norm},
            "match": match,
            "reason": reason
        })
        if match:
            filtered.append(game)
    return {"filtered": filtered, "log": log}

# --- API-Endpunkt für Filterung ---
@app.post("/api/filter_games")
async def api_filter_games(request: Request):
    data = await request.json()
    player = data.get("player")
    color = data.get("color")
    games = data.get("games")  # List of dicts with headers
    result = filter_games(games, player, color)
    logger.info(f"Filter-Log: {result['log']}")
    return JSONResponse(result)

@app.post("/api/find_moves")
async def api_find_moves(data: dict = Body(...)):
    fen = data.get("fen")
    player = data.get("player")
    color = data.get("color")
    
    if not fen or not player or not color:
        logger.error("[api_find_moves] ❌ Fehlende Parameter.")
        return {"success": False, "moves": [], "stats": {"played": 0, "win_rate": 0.0}, "total_moves_per_year": None, "error": "Missing required parameters: fen, player, color"}
    
    # BUG-FIX: Resolve frontend player name to backend player name
    backend_player = resolve_player_name(player, color)
    logger.info(f"[DEBUG] /api/find_moves: player={player}, color={color}, backend_player={backend_player}")
    
    log_section(f"API: Find Moves für {backend_player} (from {player}) | FEN: {fen[:30]}...", icon="🟩")
    global opening_tree, current_player
    if opening_tree is None or current_player != backend_player:
        logger.error(f"[api_find_moves] ❌ OpeningTree nicht geladen für '{backend_player}'. Erst /api/process_games/{backend_player} aufrufen.")
        return {"success": False, "moves": [], "stats": {"played": 0, "win_rate": 0.0}, "total_moves_per_year": None, "error": f"OpeningTree not loaded for this player '{backend_player}'. Please load games first."}
    logger.info(f"[DEBUG] OpeningTree state: own_repertoir={opening_tree.own_repertoir}, current_perspective_color={opening_tree.current_perspective_color}")
    result = opening_tree.get_moves_from_position(fen, color)
    # --- LOG: Children für die angefragte FEN ausgeben ---
    node = opening_tree.nodes_by_fen.get(opening_tree._get_node_key(fen))
    if node and node.children:
        log_lines = [
            f"    ├─ {child.move_san or uci:<6} | Games: {child.games:<3} | Win%: {child.get_win_rate():5.1f}"
            for uci, child in node.children.items()
        ]
        logger.info(f"\n[Tree/API] Children für FEN {fen[:30]}...:\n" + "\n".join(log_lines))
    elif node:
        logger.info(f"[Tree/API] Keine Children für FEN {fen[:30]}...")
    else:
        logger.info(f"[Tree/API] FEN {fen[:30]}... nicht im Tree gefunden.")
    if result is None or not isinstance(result, dict):
        logger.info(f"[api_find_moves] 📭 Keine Daten für FEN: {fen[:50]}... (Position möglicherweise noch nicht analysiert)")
        return {"success": True, "moves": [], "stats": {"played": 0, "win_rate": 0.0}, "total_moves_per_year": None, "node_id": None}
    moves = result.get("moves", [])
    games = result.get("node_stats", {}).get("games", 0)
    win_rate = result.get("node_stats", {}).get("win_rate", 0.0)
    total_moves_per_year = result.get("total_moves_per_year", None)
    node_id = result.get("node_stats", {}).get("id", None)
    log_summary(f"{len(moves)} Züge für FEN {fen[:30]}... | Spiele: {games} | Winrate: {win_rate:.1f}%")
    
    return {
        "success": True,
        "moves": moves,
        "stats": {
            "played": games,
            "win_rate": win_rate
        },
        "total_moves_per_year": total_moves_per_year,
        "node_id": node_id
    }

@app.post("/api/add_opening_line")
async def api_add_opening_line(
    frontend_player_name: str = Body(..., alias="player_name"),
    start_fen: str = Body(..., alias="fen"), # This is the FEN of the board *before* the first move in moves_san
    moves_san: List[str] = Body(..., alias="moves_san"),
    perspective_color: str = Body(default="white", alias="color") # Made optional with default
):
    logger.info(f"[API CALL] /api/add_opening_line: player={frontend_player_name}, fen={start_fen}, moves={moves_san}, color={perspective_color}")
    global opening_tree, current_player
    try:
        # Resolve frontend player to actual backend player
        player_name = resolve_player_name(frontend_player_name, perspective_color)
        
        # Log opening line addition request
        logger.info(f"📝 Add Opening Line: frontend_player={frontend_player_name}, backend_player={player_name}, start_fen={start_fen}, moves={moves_san}, color={perspective_color}")
        
        # Check if this player can save opening lines
        if get_player_type(player_name) != "repertoire":
            logger.warning(f"[add_opening_line] ❌ Player {player_name} is not a repertoire player")
            raise HTTPException(
                status_code=400, 
                detail=f"Opening lines can only be saved for repertoire players. '{player_name}' is an analysis player."
            )
        
        # Ensure the opening_tree is initialized for the correct player, or re-initialize if necessary.
        if opening_tree is None or current_player != player_name or opening_tree.player_name != player_name or opening_tree.current_perspective_color != perspective_color:
            logger.info(f"[add_opening_line] 🔄 Tree-Reinit: Switching to player '{player_name}' with perspective '{perspective_color}' (previous: {opening_tree.player_name if opening_tree else 'None'}/{opening_tree.current_perspective_color if opening_tree else 'None'})")
            current_player = player_name
            # Pass player_name to OpeningTree constructor with correct perspective
            opening_tree = OpeningTree(player_name=current_player, initial_perspective_color=perspective_color, own_repertoir=(current_player in REPERTOIRE_PLAYERS)) 
            player_pgn_dir = os.path.join(PGN_BASE_DIR, current_player, "pgn")
            if os.path.exists(player_pgn_dir):
                # Load existing PGNs for this player with the provided perspective color
                logger.info(f"[add_opening_line] Loading existing PGNs for {current_player} with color {perspective_color}")
                # Re-process all PGN files for this player and perspective using centralized function
                load_stats = _load_pgns_for_player(current_player, player_pgn_dir, opening_tree, detailed_logging=False)
                logger.info(f"[add_opening_line] Loaded {load_stats['games_loaded']} games from existing PGNs for {current_player} with color {perspective_color}.")
            else:
                logger.info(f"[add_opening_line] No existing PGN directory for {current_player} at {player_pgn_dir}. Starting with an empty tree for this player/color.")
        else:
            logger.info(f"[add_opening_line] Reusing existing OpeningTree for {player_name} with color {perspective_color}. Tree has {len(opening_tree.nodes)} nodes.")

        # Prüfe, ob die Linie bereits im Repertoire existiert
        logger.info(f"[add_opening_line] Checking if line already exists in repertoire...")
        board = chess.Board(start_fen)
        current_fen = opening_tree.normalize_fen(start_fen)  # Normalize FEN for tree lookup
        line_exists = True
        
        logger.info(f"[add_opening_line] Starting check with original FEN: {start_fen}")
        logger.info(f"[add_opening_line] Starting check with normalized FEN: {current_fen}")
        logger.info(f"[add_opening_line] Board FEN: {board.fen()}")
        logger.info(f"[add_opening_line] Moves to check: {moves_san}")
        
        for i, move_san in enumerate(moves_san):
            logger.info(f"[add_opening_line] ===== Processing move {i+1}/{len(moves_san)}: {move_san} =====")
            logger.info(f"[add_opening_line] Current FEN: {current_fen}")
            logger.info(f"[add_opening_line] Board position: {board.fen()}")
            
            # Prüfe, ob der aktuelle FEN im Tree existiert
            data = opening_tree.get_tree_data(current_fen)
            logger.info(f"[add_opening_line] Tree data for FEN exists: {data is not None}")
            
            if data is None or 'children' not in data:
                logger.info(f"[add_opening_line] No tree data or children found for FEN: {current_fen}")
                logger.info(f"[add_opening_line] Tree has {len(opening_tree.nodes)} total nodes")
                logger.info(f"[add_opening_line] Available FENs in tree: {list(opening_tree.nodes.keys())[:5]}...") 
                line_exists = False
                break
            
            logger.info(f"[add_opening_line] Available children: {list(data['children'].keys())}")
            
            # Prüfe, ob der Zug als Kindknoten existiert
            move_found = False
            target_move = None
            try:
                # Ensure the board is in the correct position for the current FEN
                logger.info(f"[add_opening_line] About to parse move '{move_san}' from board position: {board.fen()}")
                logger.info(f"[add_opening_line] Expected position (tree lookup): {current_fen}")
                
                # Parse den SAN-Zug zu einem chess.Move Objekt
                target_move = board.parse_san(move_san)
                target_uci = target_move.uci()
                logger.info(f"[add_opening_line] Looking for move '{move_san}' as UCI '{target_uci}'")
            except Exception as e:
                logger.error(f"[add_opening_line] Could not parse move '{move_san}' from position {board.fen()}: {e}")
                logger.error(f"[add_opening_line] Available legal moves: {[board.san(move) for move in board.legal_moves]}")
                # Return a more user-friendly error for illegal moves
                legal_moves = [board.san(move) for move in board.legal_moves]
                raise HTTPException(
                    status_code=400, 
                    detail=f"Illegal move '{move_san}' in position. Legal moves are: {', '.join(legal_moves[:10])}{'...' if len(legal_moves) > 10 else ''}"
                )
                line_exists = False
                break
            
            # Suche den UCI-String in den Tree-Children
            for child_uci, child_data in data['children'].items():
                logger.info(f"[add_opening_line] Comparing UCI '{child_uci}' with target UCI '{target_uci}'")
                if child_uci == target_uci:
                    move_found = True
                    logger.info(f"[add_opening_line] Move {move_san} (UCI: {target_uci}) found in tree!")
                    # Führe den Zug aus und aktualisiere den FEN
                    board.push(target_move)
                    current_fen = opening_tree.normalize_fen(board.fen())
                    logger.info(f"[add_opening_line] Updated FEN after move: {current_fen}")
                    break
            
            if not move_found:
                logger.info(f"[add_opening_line] Move {move_san} NOT found in tree. Line is new.")
                line_exists = False
                break
        
        logger.info(f"[add_opening_line] Final result: line_exists = {line_exists}")
        
        if line_exists:
            logger.info(f"[add_opening_line] Line already exists in repertoire: {' '.join(moves_san)}")
            return JSONResponse(status_code=200, content={
                "success": True, 
                "already_exists": True,
                "message": f"Linie '{' '.join(moves_san)}' ist bereits im Repertoire vorhanden."
            })

        # Speichere neue PGN-Datei (intelligent - ersetzt kürzere Dateien wenn nötig)
        try:
            # smart_save_opening_line: Ersetzt automatisch kürzere Linien
            file_name, replaced_files = smart_save_opening_line(player_name, start_fen, moves_san)
            
            if replaced_files:
                logger.info(f"[add_opening_line] Intelligently replaced {len(replaced_files)} shorter files: {[os.path.basename(f) for f in replaced_files]}")
                logger.info(f"[add_opening_line] Created new comprehensive file: {file_name}")
            else:
                logger.info(f"[add_opening_line] Created new file (no replacements needed): {file_name}")
                
        except Exception as e:
            logger.error(f"[add_opening_line] Error saving PGN: {e}")
            logger.exception("Detailed error during PGN saving:")
            raise HTTPException(status_code=500, detail=f"Error saving PGN: {str(e)}")
        
        # Live-Update des OpeningTree via PGN-Parsing
        try:
            # Bei intelligenter Speicherung: Tree muss komplett neu geladen werden
            # da alte Dateien gelöscht und neue erstellt wurden
            if replaced_files:
                logger.info(f"[add_opening_line] Tree reload required due to file replacements. Reloading tree for {player_name}...")
                # Erstelle neuen Tree für diesen Spieler/Farbe
                opening_tree = OpeningTree(player_name, perspective_color, own_repertoir=(player_name in REPERTOIRE_PLAYERS))
                current_player = player_name
                
                # Lade alle PGN-Dateien neu
                player_pgn_dir = os.path.join(PGN_BASE_DIR, current_player, "pgn")
                if os.path.exists(player_pgn_dir):
                    load_stats = _load_pgns_for_player(current_player, player_pgn_dir, opening_tree, detailed_logging=False)
                    logger.info(f"[add_opening_line] Tree reloaded with {load_stats['games_loaded']} games from {load_stats['files_processed']} files.")
                else:
                    logger.warning(f"[add_opening_line] No PGN directory found after replacement: {player_pgn_dir}")
            else:
                # Keine Dateien ersetzt - normale Tree-Update Logik
                pgn_path = os.path.join(PGN_BASE_DIR, player_name, 'pgn', file_name)
                with open(pgn_path, 'r', encoding='utf-8', errors='ignore') as pgn_file:
                    new_game = chess.pgn.read_game(pgn_file)
                if new_game is not None:
                    if start_fen != chess.STARTING_FEN and "FEN" not in new_game.headers:
                        new_game.headers["FEN"] = start_fen
                        new_game.headers["SetUp"] = "1"
                        logger.info(f"[add_opening_line] Added FEN/SetUp headers to new_game object for non-standard start: {start_fen}")
                    headers = new_game.headers
                    white_elo = safe_int(headers.get("WhiteElo"))
                    black_elo = safe_int(headers.get("BlackElo"))
                    game_details = dict(headers)
                    player_color, result_for_player, skip_stats, actual_color, skip_reason = opening_tree._get_player_perspective_color_and_result(
                        headers, player_name, perspective_color)
                    if not skip_stats and player_color is not None:
                        opening_tree.add_game_to_tree(
                            new_game, pgn_path, player_color, result_for_player, skip_stats, game_details, white_elo, black_elo)
                        logger.info(f"[add_opening_line] Tree updated with new game from {file_name} for player {player_name}, perspective {perspective_color}")
                        opening_tree.log_node_stats(opening_tree.root_fen, "add_opening_line root after update")
                    else:
                        logger.info(f"[add_opening_line] 📊 Skipped tree update for {file_name} (skip_stats=True or player_color=None)")
                else:
                    logger.info(f"[add_opening_line] 📄 No valid game parsed from PGN file {file_name} (leere/ungültige PGN)")
        except Exception as e:
            logger.error(f"[add_opening_line] Error updating tree from PGN: {e}")
            logger.exception("Detailed error during tree update:")
            # Decide if this failure should prevent a success response for file saving.
            # For now, we let it respond success for file save, but log the tree update error.

        # Erstelle Response-Message basierend auf ob Dateien ersetzt wurden
        if replaced_files:
            message = f"Linie '{' '.join(moves_san)}' erfolgreich hinzugefügt. {len(replaced_files)} kürzere Datei(en) wurden ersetzt."
        else:
            message = f"Neue Linie '{' '.join(moves_san)}' erfolgreich hinzugefügt."

        return JSONResponse(status_code=201, content={
            "success": True, 
            "already_exists": False,
            "file": file_name,
            "replaced_files": len(replaced_files),
            "message": message
        })
    except HTTPException:
        raise  # Re-raise HTTPException as is
    except Exception as e:
        logger.error(f"[add_opening_line] Unexpected error in api_add_opening_line: {e}")
        logger.exception("Detailed unexpected error:")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

# REMOVED: /api/add_single_move endpoint - functionality now integrated into get_or_create_child_by_id_and_move

# Middleware zum Unterdrücken des Access-Logs für /api/progress Requests
class SuppressProgressLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        if request.url.path.startswith('/api/progress'):
            # Temporär Logging-Level für diesen Request auf WARNING setzen
            import logging
            uvicorn_access = logging.getLogger("uvicorn.access")
            old_level = uvicorn_access.level
            uvicorn_access.setLevel(logging.WARNING)
            try:
                response = await call_next(request)
            finally:
                uvicorn_access.setLevel(old_level)
            return response
        else:
            return await call_next(request)

app.add_middleware(SuppressProgressLogMiddleware)

# Server startup moved to end of file

@app.get("/api/debug/tree_state")
async def debug_tree_state():
    """Debug-Endpunkt um den aktuellen Tree-Zustand zu überprüfen"""
    global opening_tree, current_player
    
    if opening_tree is None:
        return {"error": "No tree loaded", "current_player": current_player}
    
    # Tree-Statistiken
    total_nodes = len(opening_tree.nodes)
    root_node = opening_tree.nodes.get(opening_tree.root_fen)
    root_children = len(root_node.children) if root_node else 0
    
    # Erste paar Züge vom Root
    moves_from_root = []
    if root_node:
        for move_uci, child_node in list(root_node.children.items())[:10]:
            moves_from_root.append({
                "move_uci": move_uci,
                "move_san": child_node.move_san,
                "games": child_node.games,
                "fen": child_node.fen
            })
    
    return {
        "tree_loaded": True,
        "player": opening_tree.player_name,
        "current_player": current_player,
        "perspective": opening_tree.current_perspective_color,
        "total_nodes": total_nodes,
        "root_children": root_children,
        "moves_from_root": moves_from_root,
        "processed_files": list(opening_tree.processed_files)
    }

@app.get("/api/debug/file_management")
async def debug_file_management(
    player: str = "white_repertoir", 
    moves: str = "e4,e5,Bc4,Nf6,Nf3,Nxe4,O-O,Bc5,d3"
):
    """Debug-Endpunkt für das intelligente Datei-Management
    
    Args:
        player: Player name to test (default: white_repertoir)
        moves: Comma-separated list of moves (default: Italian Game line)
    """
    
    # Import functions
    from add_opening_lines import find_related_files, is_simple_extension, find_files_to_replace
    
    # Parse moves from query parameter
    test_moves = [move.strip() for move in moves.split(',') if move.strip()]
    
    try:
        # Finde verwandte Dateien
        related_files = find_related_files(player, test_moves)
        
        # Analyse der Ersetzungslogik
        files_to_replace = find_files_to_replace(related_files, test_moves)
        
        debug_info = {
            "player": player,
            "test_moves": test_moves,
            "related_files_count": len(related_files),
            "related_files": [
                {
                    "file": os.path.basename(file_path),
                    "moves": file_moves,
                    "is_extension": is_simple_extension(file_moves, test_moves)
                }
                for file_path, file_moves in related_files
            ],
            "files_to_replace_count": len(files_to_replace),
            "files_to_replace": [os.path.basename(f) for f in files_to_replace]
        }
        
        return debug_info
        
    except Exception as e:
        return {"error": f"Debug failed: {str(e)}", "player": player, "test_moves": test_moves}

@app.post("/api/get_child_node")
async def get_child_node(request: Request):
    import logging
    import json
    import traceback
    logger = logging.getLogger("api")
    try:
        data = await request.json()
        node_id = data.get("node_id")
        move_san = data.get("move_san")
        save_switch_active = data.get("save_switch_active", False)
        if not node_id or not move_san:
            response = {"success": False, "error": "node_id and move_san required"}
            logger.error(f"[get_child_node] {response}")
            return JSONResponse(response, status_code=400)
        child_node_dict = opening_tree.get_or_create_child_by_id_and_move(node_id, move_san, save_switch_active=save_switch_active)
        response = {"success": True, "child": child_node_dict}
        logger.info(f"[get_child_node] Returning: {json.dumps(response)[:500]}...")
        return JSONResponse(response)
    except Exception as e:
        tb = traceback.format_exc()
        response = {"success": False, "error": str(e), "traceback": tb}
        logger.error(f"[get_child_node] Exception: {response}")
        return JSONResponse(response, status_code=400)

@app.post("/api/get_children")
async def get_children(request: Request):
    data = await request.json()
    node_id = data.get("node_id")
    if not node_id:
        return JSONResponse({"success": False, "error": "node_id required"}, status_code=400)
    node = opening_tree.nodes.get(node_id)
    if not node:
        return JSONResponse({"success": False, "error": "Node not found"}, status_code=404)
    # Nur Kinder mit is_in_repertoire=True zurückgeben
    children = [child.to_dict(include_children=False, is_repertoire=opening_tree.own_repertoir) for child in node.children.values() if child.is_in_repertoire]
    return JSONResponse({
        "success": True,
        "children": children
    })

def safe_int(value, default=0):
    """Sichere Konvertierung zu Integer mit Default-Wert für leere Strings oder None"""
    try:
        if isinstance(value, str) and value.strip() == "":
            return default
        return int(value) if value is not None else default
    except (ValueError, TypeError):
        return default

def _load_pgns_for_player(player: str, player_dir: str, opening_tree: OpeningTree, detailed_logging: bool = False):
    """
    Dedicated function to load PGN files for a player into an opening tree.
    
    Args:
        player: Player name
        player_dir: Directory containing PGN files
        opening_tree: OpeningTree instance to load games into
        detailed_logging: Whether to log detailed statistics and skip reasons
    
    Returns:
        dict: Statistics about the loading process
    """
    start_time = time.time()
    
    # Find PGN files
    pgn_files = [f for f in os.listdir(player_dir) if f.endswith('.pgn')]
    logger.info(f"📄 Found PGN files: {len(pgn_files)}")
    
    # Initialize counters
    total_games = 0
    games_loaded = 0
    games_skipped = 0
    skip_reasons = {}
    
    # Process each PGN file
    for pgn_file in pgn_files:
        file_path = os.path.join(player_dir, pgn_file)
        file_games = 0
        file_loaded = 0
        file_skipped = 0
        
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                while True:
                    try:
                        game = chess.pgn.read_game(f)
                        if game is None:
                            break
                        
                        file_games += 1
                        total_games += 1
                        
                        # Extract game details
                        headers = game.headers
                        white_elo = safe_int(headers.get("WhiteElo"))
                        black_elo = safe_int(headers.get("BlackElo"))
                        game_details = dict(headers)
                        
                        # Get player perspective and result
                        player_color, result_for_player, skip_stats, actual_color, skip_reason = opening_tree._get_player_perspective_color_and_result(
                            headers, player, opening_tree.current_perspective_color)
                        
                        # Skip if player not found in game
                        if player_color is None:
                            file_skipped += 1
                            games_skipped += 1
                            
                            # Track skip reasons for detailed logging
                            reason = skip_reason if skip_reason else 'Player not found in game'
                            skip_reasons[reason] = skip_reasons.get(reason, 0) + 1
                            
                            # Log individual skip cases for debugging (first few only)
                            if detailed_logging and file_skipped <= 3:
                                logger.info(f"⏭️  SKIP #{file_skipped} in {pgn_file}: {reason}")
                                logger.info(f"    📝 Headers: W='{headers.get('White', 'N/A')}', B='{headers.get('Black', 'N/A')}', Result='{headers.get('Result', 'N/A')}'")
                                logger.info(f"    🎯 Looking for player: '{player}' with perspective: '{opening_tree.current_perspective_color}'")
                            continue
                        
                        # Add game to tree
                        opening_tree.add_game_to_tree(
                            game, file_path, player_color, result_for_player, skip_stats, game_details, white_elo, black_elo)
                        file_loaded += 1
                        games_loaded += 1
                        
                    except Exception as e:
                        file_skipped += 1
                        games_skipped += 1
                        
                        # Categorize error for tracking
                        error_msg = str(e).lower()
                        if "invalid" in error_msg or "parse" in error_msg:
                            reason = 'Invalid PGN syntax/Parse error'
                        elif "move" in error_msg:
                            reason = 'Invalid move in PGN'
                        elif "encoding" in error_msg or "unicode" in error_msg:
                            reason = 'Encoding/Unicode error'
                        else:
                            reason = f'Processing error: {str(e)[:50]}'
                        
                        skip_reasons[reason] = skip_reasons.get(reason, 0) + 1
                        
                        if detailed_logging and file_skipped <= 3:
                            logger.error(f"❌ Error processing game in {pgn_file}: {e}")
                            
        except Exception as e:
            logger.error(f"❌ Error reading file {pgn_file}: {e}")
            continue
    
    load_time = time.time() - start_time
    
    # Log summary
    if detailed_logging and skip_reasons:
        logger.info(f"📊 Skip reasons summary:")
        for reason, count in skip_reasons.items():
            logger.info(f"   • {reason}: {count} games")
    
    logger.info(f"✅ PGN loading completed: {games_loaded} games loaded from {len(pgn_files)} files in {load_time:.2f}s")
    
    return {
        'total_games': total_games,
        'games_loaded': games_loaded,
        'games_skipped': games_skipped,
        'skip_reasons': skip_reasons,
        'files_processed': len(pgn_files),
        'load_time': load_time
    }

@app.post("/api/get_node_by_id")
async def get_node_by_id(request: Request):
    import logging
    import json
    import traceback
    logger = logging.getLogger("api")
    try:
        data = await request.json()
        node_id = data.get("node_id")
        if not node_id:
            response = {"success": False, "error": "node_id required"}
            logger.error(f"[get_node_by_id] {response}")
            return JSONResponse(response, status_code=400)
        node = opening_tree.nodes.get(node_id)
        if not node:
            response = {"success": False, "error": f"Node with id {node_id} not found"}
            logger.error(f"[get_node_by_id] {response}")
            return JSONResponse(response, status_code=404)
        node_dict = node.to_dict(opening_tree.current_perspective_color, include_children=True, is_repertoire=opening_tree.own_repertoir)
        response = {"success": True, "node": node_dict}
        logger.info(f"[get_node_by_id] Returning: {json.dumps(response)[:500]}...")
        return JSONResponse(response)
    except Exception as e:
        tb = traceback.format_exc()
        response = {"success": False, "error": str(e), "traceback": tb}
        logger.error(f"[get_node_by_id] Exception: {response}")
        return JSONResponse(response, status_code=400)

# ====================================================================
# LEARNING STATUS API ENDPOINTS
# ====================================================================

@app.post("/api/training/mark_studied")
async def mark_node_studied(request: Request):
    """Mark a node as studied and propagate status up the tree"""
    import logging
    import json
    import traceback
    logger = logging.getLogger("api")
    
    try:
        data = await request.json()
        node_id = data.get("node_id")
        session_id = data.get("session_id")
        
        if not node_id or not session_id:
            response = {"success": False, "error": "node_id and session_id required"}
            logger.error(f"[mark_node_studied] {response}")
            return JSONResponse(response, status_code=400)
        
        if not opening_tree:
            response = {"success": False, "error": "No opening tree loaded"}
            logger.error(f"[mark_node_studied] {response}")
            return JSONResponse(response, status_code=500)
        
        success = opening_tree.mark_node_as_studied(node_id, session_id)
        
        if success:
            response = {"success": True, "message": f"Node {node_id[:8]} marked as studied"}
            logger.info(f"[mark_node_studied] {response['message']}")
        else:
            response = {"success": False, "error": "Failed to mark node as studied"}
            logger.error(f"[mark_node_studied] {response}")
        
        return JSONResponse(response)
        
    except Exception as e:
        tb = traceback.format_exc()
        response = {"success": False, "error": str(e), "traceback": tb}
        logger.error(f"[mark_node_studied] Exception: {response}")
        return JSONResponse(response, status_code=400)

@app.get("/api/training/get_unstudied_moves")
async def get_unstudied_moves(session_id: str, position_fen: str):
    """Get only unstudied moves from current position"""
    import logging
    logger = logging.getLogger("api")
    
    try:
        if not opening_tree:
            response = {"success": False, "error": "No opening tree loaded"}
            logger.error(f"[get_unstudied_moves] {response}")
            return JSONResponse(response, status_code=500)
        
        result = opening_tree.get_unstudied_moves_from_position(position_fen, session_id)
        
        if "error" in result:
            response = {"success": False, "error": result["error"]}
            logger.error(f"[get_unstudied_moves] {response}")
            return JSONResponse(response, status_code=404)
        
        response = {"success": True, **result}
        logger.info(f"[get_unstudied_moves] Returning {len(result.get('moves', []))} unstudied moves")
        return JSONResponse(response)
        
    except Exception as e:
        response = {"success": False, "error": str(e)}
        logger.error(f"[get_unstudied_moves] Exception: {response}")
        return JSONResponse(response, status_code=400)

@app.get("/api/training/get_progress")
async def get_learning_progress(session_id: str):
    """Get overall learning progress for the session"""
    import logging
    logger = logging.getLogger("api")
    
    try:
        if not opening_tree:
            response = {"success": False, "error": "No opening tree loaded"}
            logger.error(f"[get_learning_progress] {response}")
            return JSONResponse(response, status_code=500)
        
        progress = opening_tree.get_learning_progress(session_id)
        
        if "error" in progress:
            response = {"success": False, "error": progress["error"]}
            logger.error(f"[get_learning_progress] {response}")
            return JSONResponse(response, status_code=500)
        
        response = {"success": True, "progress": progress}
        logger.info(f"[get_learning_progress] Session {session_id[:8]}: {progress.get('studied_nodes', 0)}/{progress.get('total_nodes', 0)} nodes studied")
        return JSONResponse(response)
        
    except Exception as e:
        response = {"success": False, "error": str(e)}
        logger.error(f"[get_learning_progress] Exception: {response}")
        return JSONResponse(response, status_code=400)

@app.post("/api/training/mark_directly_learned")
async def mark_directly_learned(request: Request):
    """Mark a node as directly learned in this session (only if not already marked)."""
    import logging
    logger = logging.getLogger("api")
    try:
        data = await request.json()
        node_id = data.get("node_id")
        session_id = data.get("session_id")
        if not node_id or not session_id:
            return JSONResponse({"success": False, "error": "node_id and session_id required"}, status_code=400)
        node = opening_tree.nodes.get(node_id)
        if not node:
            return JSONResponse({"success": False, "error": f"Node {node_id} not found"}, status_code=404)
        already_learned = node.is_directly_learned(session_id)
        if not already_learned:
            node.mark_as_directly_learned(session_id)
        return JSONResponse({"success": True, "newly_learned": not already_learned})
    except Exception as e:
        logger.error(f"[mark_directly_learned] Exception: {e}")
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)

@app.post("/api/training/unmark_directly_learned")
async def unmark_directly_learned(request: Request):
    """Unmark a node as directly learned in this session (for mistakes)."""
    import logging
    logger = logging.getLogger("api")
    try:
        data = await request.json()
        node_id = data.get("node_id")
        session_id = data.get("session_id")
        if not node_id or not session_id:
            return JSONResponse({"success": False, "error": "node_id and session_id required"}, status_code=400)
        node = opening_tree.nodes.get(node_id)
        if not node:
            return JSONResponse({"success": False, "error": f"Node {node_id} not found"}, status_code=404)
        was_learned = node.is_directly_learned(session_id)
        if was_learned:
            node.unmark_as_directly_learned(session_id)
        return JSONResponse({"success": True, "was_learned": was_learned})
    except Exception as e:
        logger.error(f"[unmark_directly_learned] Exception: {e}")
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)

@app.post("/api/training/record_mistake")
async def record_mistake(request: Request):
    """Increment the mistake counter for this session."""
    import logging
    logger = logging.getLogger("api")
    try:
        data = await request.json()
        session_id = data.get("session_id")
        if not session_id:
            return JSONResponse({"success": False, "error": "session_id required"}, status_code=400)
        opening_tree.increment_mistake(session_id)
        return JSONResponse({"success": True, "mistake_count": opening_tree.get_mistake_count(session_id)})
    except Exception as e:
        logger.error(f"[record_mistake] Exception: {e}")
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)

@app.get("/api/training/get_learning_stats")
async def get_learning_stats(session_id: str):
    """Get directly learned count, mistake count, and node IDs for this session."""
    import logging
    logger = logging.getLogger("api")
    try:
        directly_learned_count = opening_tree.get_directly_learned_count(session_id)
        mistake_count = opening_tree.get_mistake_count(session_id)
        node_ids = opening_tree.get_directly_learned_node_ids(session_id)
        return JSONResponse({
            "success": True,
            "directly_learned_count": directly_learned_count,
            "mistake_count": mistake_count,
            "directly_learned_node_ids": node_ids
        })
    except Exception as e:
        logger.error(f"[get_learning_stats] Exception: {e}")
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)

@app.post("/api/delete_node")
async def delete_node(request: Request):
    data = await request.json()
    node_id = data.get("node_id")
    if not node_id:
        return JSONResponse({"success": False, "error": "node_id missing"}, status_code=400)
    # Finde parent_id vor dem Löschen
    node = opening_tree.nodes.get(node_id)
    parent_id = node.parent_id if node else None
    success = opening_tree.delete_node_and_subtree(node_id)
    return JSONResponse({"success": success, "parent_id": parent_id})