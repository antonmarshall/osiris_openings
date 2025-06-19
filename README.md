# osiris openings – Chess Opening Repertoire System

A modern chess opening repertoire visualization and analysis system with an intuitive web interface. Features per-game processing, intelligent duplicate detection, and customizable arrow visualization.

## Project Structure

### Core Files
- **app.py**: FastAPI server with REST API endpoints
- **opening_tree.py**: Tree structure for chess positions and statistics 
- **add_opening_lines.py**: Opening line management with intelligent file handling
- **static/**: Frontend assets (HTML, CSS, JavaScript)

### Key Features
- **Interactive Chess Board**: Drag & drop moves with real-time analysis
- **Smart Opening Management**: Duplicate detection and intelligent file storage
- **Customizable Visualization**: Toggle between uniform and variable arrow thickness
- **Player-Specific Analysis**: Load and analyze games by specific players
- **Modern API**: RESTful endpoints with comprehensive logging

### Data Management
- **players/**: Player-specific data and PGN files
- **data/pgn/**: Organized game collections
- **Intelligent Storage**: Automatic cleanup of redundant opening files

## Quick Start

1. **Install Dependencies**:
   ```bash
   pip install fastapi uvicorn python-chess
   ```

2. **Start Server**:
   ```bash
   python app.py
   ```

3. **Open Browser**: Navigate to `http://localhost:8000`

## API Endpoints

- `/api/players` - Get available players
- `/api/load_player/{player}` - Load player data  
- `/api/moves` - Get moves for position
- `/api/add_opening_line` - Add new opening line
- `/api/set_arrow_thickness` - Toggle arrow visualization
- `/api/debug/*` - Development and debugging endpoints

## Features

### Arrow Visualization
- **Variable Mode**: Arrow thickness based on game frequency
- **Uniform Mode**: Consistent arrow thickness for cleaner view
- Backend-controlled rendering ensures consistency

### Opening Line Management  
- Automatic duplicate detection using normalized FEN + UCI
- Intelligent file cleanup when longer lines supersede shorter ones
- Comprehensive logging for debugging and monitoring

### Robust Processing
- Per-game PGN processing with detailed error handling
- FEN normalization for consistent position matching
- Extensive logging and debugging capabilities
