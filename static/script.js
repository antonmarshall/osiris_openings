// ====================================================================
// HORUS Chess Opening Trainer - Frontend Logic (Node-ID Based)
// ====================================================================
// LOGIC OVERVIEW:
// - All navigation and move reporting is node-id-based (not FEN-based).
// - When a position is loaded, the backend returns a node_id; this is stored in appState.currentNodeId.
// - When a move is played, the frontend sends the current node_id and move SAN to the backend, which returns the new node (with FEN, children, etc.).
// - chess.js is used only for move validation and SAN extraction in Repertoire-Modus.
// - All FEN-based navigation logic is obsolete and removed.
// ====================================================================
import { Chessground } from 'https://cdn.jsdelivr.net/npm/chessground@9.2.1/dist/chessground.js';
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Chess.js game logic
  const game = new Chess();
  const annotationStore = new Map();

  // --- Event-Handler ---
  function onSelect(square) {
    console.log(`🎯 PIECE SELECTED: ${square}`);
    console.log(`🔍 Current arrows on board:`, window.cg?.state?.drawable?.shapes?.length || 0);
    const isOwnRepertoire = appState.currentPlayer === 'white_repertoir' || appState.currentPlayer === 'black_repertoir';
    let selectable = false;
    if (isOwnRepertoire) {
      // Im Repertoire-Modus: alle legalen Züge laut chess.js
      const Chess = window.game.constructor;
      const chess = new Chess(appState.currentPosition);
      const legalMoves = chess.moves({ verbose: true });
      const availableFromSquares = new Set(legalMoves.map(m => m.from));
      selectable = availableFromSquares.has(square);
      console.log(`[REPERTOIRE MODUS] selectable from squares:`, Array.from(availableFromSquares));
    } else if (typeof window.appState !== 'undefined' && window.appState.availableMoves) {
      // Im Tree-Modus: nur Tree-Moves
      const availableFromSquares = new Set();
      window.appState.availableMoves.forEach(move => {
        if (move.uci && move.uci.length >= 4) {
          availableFromSquares.add(move.uci.substring(0, 2));
        }
      });
      selectable = availableFromSquares.has(square);
      console.log(`[TREE MODUS] selectable from squares:`, Array.from(availableFromSquares));
    }
    if (selectable) {
      console.log(`✅ Piece at ${square} has legal moves`);
    } else {
      console.log(`⚠️ Piece at ${square} has no legal moves`);
    }
    // Nach dem Selektieren: Zugpfeile anzeigen
    if (typeof window.showAvailableMovesArrows === 'function') {
      window.showAvailableMovesArrows(window.appState.availableMoves || []);
    }
  }
  function onMove(from, to) {
    console.log(`🖱️ CLICK-TO-MOVE: User moved ${from} → ${to}`);
    if (typeof window.handleDragDropMove === 'function') {
      window.handleDragDropMove(from, to);
    } else {
      console.warn('⚠️ handleDragDropMove not available, falling back to Chess.js validation');
      const result = game.move({ from, to });
      if (!result) {
        cg.set({ fen: game.fen(), movable: { free: false, color: config.movable.color }, drawable: { ...cg.state.drawable, shapes: cg.state.drawable.shapes } });
        console.log('[DEBUG] cg.set called (invalid move fallback):', { fen: game.fen(), movable: { free: false, color: config.movable.color }, drawable: { ...cg.state.drawable, shapes: cg.state.drawable.shapes } });
        console.log('❌ Invalid move rejected by Chess.js');
        return;
      }
      cg.set({ fen: game.fen(), lastMove: [from, to], drawable: { ...cg.state.drawable, shapes: cg.state.drawable.shapes } });
      console.log('[DEBUG] cg.set called (move validated fallback):', { fen: game.fen(), lastMove: [from, to], drawable: { ...cg.state.drawable, shapes: cg.state.drawable.shapes } });
      console.log('✅ Move validated by Chess.js (fallback mode)');
    }
  }
  function onDraw(shape) { annotationStore.set(shape.id, shape); }
  function onErase(shape) { annotationStore.delete(shape.id); }

  // --- Chessground-Konfiguration ---
  const config = {
    draggable: { enabled: true, showGhost: false },
    orientation: 'white',
    viewOnly: false,
    disableContextMenu: true,
    animation: { enabled: true, duration: 200 },
    highlight: { lastMove: true, check: true, legalMoves: true },
    movable: { free: false, color: 'both', showDests: true, dests: new Map() },
    selectable: { enabled: true },
    events: { select: onSelect, move: onMove },
    drawable: {
      enabled: true, visible: true, eraseOnClick: false, shapes: [],
      brushes: {
        excellent: { key: 'excellent', color: '#4caf50', opacity: 1.0, lineWidth: 6 },
        good: { key: 'good', color: '#8bc34a', opacity: 1.0, lineWidth: 6 },
        average: { key: 'average', color: '#ffeb3b', opacity: 1.0, lineWidth: 6 },
        below: { key: 'below', color: '#ff9800', opacity: 1.0, lineWidth: 6 },
        poor: { key: 'poor', color: '#f44336', opacity: 1.0, lineWidth: 6 },
        nodata: { key: 'nodata', color: '#9e9e9e', opacity: 1.0, lineWidth: 4 },
        repertoire: { key: 'repertoire', color: '#4caf50', opacity: 1.0, lineWidth: 8 }
      },
      events: { draw: onDraw, erase: onErase }
    }
  };
  const cg = Chessground(document.getElementById('board'), config);
  window.cg = cg;
  window.game = game;
  window.resetBoard = function() {
    game.reset();
    cg.set({ fen: game.fen(), orientation: 'white', drawable: { ...cg.state.drawable, shapes: cg.state.drawable.shapes } });
    console.log('[DEBUG] cg.set called (resetBoard):', { fen: game.fen(), orientation: 'white', drawable: { ...cg.state.drawable, shapes: cg.state.drawable.shapes } });
  };
  window.flipBoard = function() { cg.toggleOrientation(); };
  window.getChessgroundBrush = function(backendColor, isRepertoire = false) {
    if (isRepertoire) return 'repertoire';
    const colorToBrush = {
      '#4caf50': 'excellent', '#8bc34a': 'good', '#ffeb3b': 'average', '#ff9800': 'below', '#f44336': 'poor', '#9e9e9e': 'nodata'
    };
    return colorToBrush[backendColor] || 'nodata';
  };
  window.addEventListener('resize', () => { cg.redrawAll(); });
});

// ====================================================================
// 1. GLOBAL STATE & CONFIGURATION
// ====================================================================

const CONFIG = {
  API_BASE: '/api',
  BOARD_SIZE: 400,
  DEFAULT_FEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
};

let appState = {
  currentPlayer: null,
  currentColor: 'white',
  gameHistory: [],
  board: null,
  game: null,
  // --- Navigation State für Schritt 3 ---
  moveHistory: [],           // Array von {move, fen, stats}
  currentPosition: CONFIG.DEFAULT_FEN,  // Aktuelle FEN
  availableMoves: [],        // Verfügbare Züge von Backend
  isNavigating: false,        // Flag für Navigation-State
  boardOrientation: 'white', // Track user-selected orientation
  inRepertoire: true, // <--- NEU: Modus-Flag
  lastTreeFen: CONFIG.DEFAULT_FEN, // <--- Merkt sich letzte Tree-Position
  currentNodeId: null // <--- NEU: Aktuelle Node-ID
};

// ✅ CRITICAL FIX: Expose appState globally for script-cg.js access
window.appState = appState;

// ====================================================================
// 2. UTILITY FUNCTIONS (Reine Hilfsfunktionen)
// ====================================================================

/**
 * Validate if a string represents a valid chess square (a1-h8)
 * TODO-TESTING: Add comprehensive unit tests for edge cases
 */
function isValidSquare(square) {
  if (!square || typeof square !== 'string' || square.length !== 2) {
    return false;
  }
  
  const file = square[0].toLowerCase();
  const rank = square[1];
  
  return file >= 'a' && file <= 'h' && rank >= '1' && rank <= '8';
}

// Hilfsfunktion: Prüfe, ob aktuelle FEN im Tree ist
async function checkIfInRepertoire(fen) {
  try {
    const response = await fetch('/api/find_moves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fen: fen,
        player: appState.currentPlayer,
        color: appState.currentColor
      })
    });
    const data = await response.json();
    if (data.success && data.moves && data.moves.length > 0) {
      appState.inRepertoire = true;
      appState.lastTreeFen = fen;
    } else {
      appState.inRepertoire = false;
    }
    return appState.inRepertoire;
  } catch (e) {
    appState.inRepertoire = false;
    return false;
  }
}

// Nach jedem Zug, Back, Analyse: Modus prüfen und UI anpassen
async function afterPositionChange(fen) {
  const inRep = await checkIfInRepertoire(fen);
  const saveStatus = document.getElementById('saveStatus');
  // Nur noch updateLegalMovesFromBackend setzt legale Züge!
    if (typeof window.updateLegalMovesFromBackend === 'function') window.updateLegalMovesFromBackend();
  if (inRep) {
    showAvailableMovesArrows(appState.availableMoves || []);
    updateMovesList(appState.availableMoves || []);
    if (saveStatus) saveStatus.textContent = '';
    const backToRepBtn = document.getElementById('backToRepertoireBtn');
    if (backToRepBtn) backToRepBtn.style.display = 'none';
  } else {
    showAvailableMovesArrows([]);
    updateMovesList([]);
    if (saveStatus) saveStatus.textContent = '⚠️ Außerhalb des Repertoires!';
    let backToRepBtn = document.getElementById('backToRepertoireBtn');
    if (!backToRepBtn) {
      backToRepBtn = document.createElement('button');
      backToRepBtn.id = 'backToRepertoireBtn';
      backToRepBtn.textContent = 'Zurück zum Repertoire';
      backToRepBtn.style = 'margin-top:8px;padding:6px 16px;font-size:0.95rem;background:#eee;border-radius:6px;border:1px solid #bbb;cursor:pointer;';
      saveStatus?.parentNode?.appendChild(backToRepBtn);
    }
    backToRepBtn.style.display = 'inline-block';
    backToRepBtn.onclick = async () => {
      renderChessBoard(appState.lastTreeFen, appState.currentColor);
      await loadMovesForPosition(appState.lastTreeFen);
      await afterPositionChange(appState.lastTreeFen);
    };
  }
  // Always update node id after position change
  try {
    const response = await fetch('/api/find_moves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fen: fen,
        player: appState.currentPlayer,
        color: appState.currentColor
      })
    });
    const data = await response.json();
    appState.currentNodeId = data.node_id || null;
  } catch (e) {
    appState.currentNodeId = null;
  }
}

// ====================================================================
// 3. API LAYER (Server-Kommunikation)
// ====================================================================
// BACKEND-FOKUSSIERT: All color calculations moved to backend
// Frontend uses move.color, move.opacity, move.thickness from API

/**
 * Simple API test function - tests if backend is running
 */
async function testAPI() {
  try {
    console.log('🔍 Testing API connection...');
    const response = await fetch('/api/players');
    const data = await response.json();
    console.log('✅ API Test successful:', data);
    return data;
  } catch (error) {
    console.error('❌ API Test failed:', error);
    return null;
  }
}

/**
 * Load players and populate dropdown
 */
async function loadPlayers() {
  try {
    console.log('👥 Loading players...');
    const data = await testAPI();
    
    if (!data || !data.success) {
      console.error('❌ Failed to load players');
      return;
    }
    
    const select = document.getElementById('playerSelect');
    if (!select) {
      console.error('❌ playerSelect element not found');
      return;
    }
    
    // Clear existing options
    select.innerHTML = '';
    
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Spieler auswählen...';
    select.appendChild(defaultOption);
    
    // Add "My Repertoire" option if repertoire directories exist
    if (data.has_repertoire) {
        const repertoireOption = document.createElement('option');
        repertoireOption.value = "My Repertoire";
        repertoireOption.textContent = "My Repertoire";
        select.appendChild(repertoireOption);
    }
    
    // Add player options
    data.players.forEach(player => {
      const option = document.createElement('option');
      option.value = player;
      option.textContent = player;
      select.appendChild(option);
    });
    
    console.log('✅ Players loaded:', data.players);
  } catch (error) {
    console.error('❌ Error loading players:', error);
  }
}

// ====================================================================
// 4. RESULTS DISPLAY FUNCTIONS
// ====================================================================

/**
 * Display analysis results in the HTML page
 */
function displayAnalysisResults(data, playerName, color) {
  console.log('🎨 Displaying analysis results for', playerName, color);
  
  // --- NEW: Control Repertoire Switch Visibility ---
  const repertoireControls = document.getElementById('repertoireControls');
  if (repertoireControls) {
    if (playerName === "My Repertoire") {
      repertoireControls.style.display = 'block';
    } else {
      repertoireControls.style.display = 'none';
    }
  }
  // --- END NEW ---

  // --- Initialize Navigation State (Schritt 3.1) ---
  appState.currentPlayer = playerName;
  appState.currentColor = color;
  appState.currentPosition = data.position;
  appState.availableMoves = data.moves || [];
  appState.moveHistory = []; // Reset history for new analysis
  appState.isNavigating = false;
  
  console.log('🎯 Navigation state initialized:', {
    player: appState.currentPlayer,
    color: appState.currentColor,
    position: appState.currentPosition.substring(0, 30) + '...',
    moves: appState.availableMoves.length
  });
  
  // Show the results section
  const resultsSection = document.getElementById('analysisResults');
  if (!resultsSection) {
    console.error('❌ analysisResults element not found');
    return;
  }
  
  resultsSection.style.display = 'block';
  
  // Update position info
  const positionInfo = document.getElementById('positionInfo');
  if (positionInfo) {
    positionInfo.innerHTML = `
      <strong>Player:</strong> ${playerName} (${color}) | 
      <strong>Position:</strong> ${data.position.substring(0, 30)}...
    `;
  }
    // Update position statistics
  const statsContent = document.getElementById('statsContent');
  if (statsContent) {
    statsContent.innerHTML = `
      <div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 0.9rem;">
        <div style="background: #f8f9fa; padding: 6px 10px; border-radius: 4px; border: 1px solid #e9ecef;">
          <strong>Games:</strong> ${data.games || 0}
        </div>
        <div style="background: #f8f9fa; padding: 6px 10px; border-radius: 4px; border: 1px solid #e9ecef;">
          <strong>Win Rate:</strong> ${(data.win_rate || 0).toFixed(1)}%
        </div>
        <div style="background: #f8f9fa; padding: 6px 10px; border-radius: 4px; border: 1px solid #e9ecef;">
          <strong>Moves:</strong> ${data.moves?.length || 0}
        </div>
      </div>
    `;
  }
    // Update moves list
  const movesList = document.getElementById('movesList');
  if (movesList && data.moves) {
    if (data.moves.length === 0) {
      movesList.innerHTML = '<p style="color: #666; font-style: italic;">No moves available from this position.</p>';
    } else {      const movesHtml = data.moves.map((move, index) => {
        // BACKEND-FOKUSSIERT: Use backend-calculated color directly (no frontend calculation)
        const backendColor = move.color || '#888888'; // Backend provides optimal color
        return `
          <div class="move-item" data-move-index="${index}" style="
            display: flex; 
            justify-content: space-between; 
            align-items: center;
            padding: 8px 12px; 
            margin: 4px 0;
            background: ${backendColor}22;
            border-left: 4px solid ${backendColor};
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.2s;
          " onmouseover="this.style.backgroundColor='${backendColor}44'" 
             onmouseout="this.style.backgroundColor='${backendColor}22'"
             title="Click to play move | Games: ${move.games} | Wins: ${move.wins} | Draws: ${move.draws} | Losses: ${move.losses}">
            
            <div style="font-weight: 600; font-size: 1rem; color: #333;">
              ${formatMoveDisplay(move)}
            </div>
            
            <div style="display: flex; gap: 12px; align-items: center; font-size: 0.9rem;">
              <span style="color: #666;">${move.games} games</span>
              <span style="color: ${backendColor}; font-weight: 600;">${(move.win_rate || 0).toFixed(1)}%</span>
            </div>
          </div>
        `;
      }).join('');
      
      movesList.innerHTML = movesHtml;
      
      // --- Add Click Event Listeners to Moves (Schritt 3.2) ---
      addMoveClickListeners();
    }
  }  // Render chess board with current position
  renderChessBoard(data.position, color);
    // ✅ NEW: Set up legal moves for click-to-move
  // Update appState first
  appState.currentPosition = data.position;
  appState.availableMoves = data.moves || [];
  appState.currentPlayer = playerName;
  appState.currentColor = color;
  appState.currentNodeId = data.node_id || null; // <--- Store node id
  
  // Show arrows for available moves (initial display)
  showAvailableMovesArrows(data.moves || []);
  
  // Then update Chessground legal moves (AFTER appState is updated)
  if (typeof window.updateLegalMovesFromBackend === 'function') {
    window.updateLegalMovesFromBackend();
    showAvailableMovesArrows(appState.availableMoves || []);
  }
  
  console.log('✅ Results displayed successfully');
}

// ====================================================================
// 5. BUSINESS LOGIC (App-spezifische Logik)
// ====================================================================
// BACKEND-FOKUSSIERT: Color logic moved to backend Node.get_move_color()

// ====================================================================
// 6. EVENT HANDLERS (User-Interaktionen)
// ====================================================================

/**
 * Handle analyze button click
 */
// ====================================================================
// 6. ANALYSIS HANDLING
// ====================================================================

/**
 * Handle the "Analyze" button click
 */
async function handleAnalyzeClick() {
  try {
    console.log('🔍 Analyzing openings...');
    
    // Get selected player
    const playerSelect = document.getElementById('playerSelect');
    const selectedPlayer = playerSelect.value;
    
    if (!selectedPlayer) {
      console.warn('⚠️ No player selected');
      alert('Bitte einen Spieler auswählen!');
      return;
    }
    
    // Get selected color
    const colorRadios = document.getElementsByName('colorSelect');
    let selectedColor = 'white'; // default
    for (const radio of colorRadios) {
      if (radio.checked) {
        selectedColor = radio.value;
        break;
      }
    }
    
    console.log('👤 Player:', selectedPlayer);
    console.log('⚫⚪ Color:', selectedColor);
      // Make API call
    console.log('📡 Calling API...');
    const response = await fetch(`/api/process_games/${selectedPlayer}?color=${selectedColor}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    console.log('📊 Analysis result:', data);
      if (data.success) {
      console.log('✅ Analysis successful!');
      console.log('🎯 Position:', data.position);
      console.log('🔢 Games:', data.games);
      console.log('📈 Win rate:', data.win_rate);
      console.log('♟️ Available moves:', data.moves?.length || 0);
      
      // Display results in HTML
      displayAnalysisResults(data, selectedPlayer, selectedColor);
    } else {
      console.error('❌ Analysis failed');
    }
    
  } catch (error) {
    console.error('❌ Error during analysis:', error);
  }
}

// ====================================================================
// 4. CHESS BOARD RENDERING
// ====================================================================

// ====================================================================
// 4. CHESS BOARD RENDERING (Using Chessground from script-cg.js)
// ====================================================================

// Note: Chessground board instance is managed in script-cg.js as window.cg

// ====================================================================
// 4. CHESS BOARD RENDERING (Using Chessground from script-cg.js)
// ====================================================================

/**
 * Render a chess position from FEN string (using Chessground)
 */
function renderChessBoard(fen, playerColor = 'white') {
  try {
    console.log('🎨 Rendering chess board with FEN:', fen.substring(0, 30) + '...');
      // Use the global Chessground instance from script-cg.js
    if (typeof window.cg !== 'undefined') {
      // Use persisted orientation
      const orientation = appState.boardOrientation;
      // Preserve existing movable configuration when updating FEN
      const currentMovable = window.cg.state.movable;
      // Events: aus aktuellem State oder aus globaler Config
      let events = window.cg.state.events;
      if (!events && window.chessgroundConfig) {
        events = window.chessgroundConfig.events;
      }
      // Update the Chessground board while preserving legal moves
      updateBoardAndArrows({
        fen: fen,
        orientation: orientation,
        movable: currentMovable,  // Preserve legal moves (dests) and other movable settings
        events: events
      }, 'renderChessBoard');
      // Nur noch updateLegalMovesFromBackend setzt legale Züge!
      if (typeof window.updateLegalMovesFromBackend === 'function') window.updateLegalMovesFromBackend();
        console.log('✅ Board rendered successfully with Chessground, orientation:', orientation);
      console.log('✅ Legal moves preserved:', currentMovable?.dests?.size || 0, 'pieces');
      // DEBUG: Log legal moves after board update
      if (currentMovable?.dests?.size > 0) {
        console.log('🎯 Available legal moves after board update:');
        for (const [from, tos] of currentMovable.dests) {
          console.log(`   ${from} → [${tos.join(', ')}]`);
        }
      }
    } else {
      console.error('❌ Chessground instance not available - waiting for script-cg.js');
      // Retry after short delay if Chessground not yet loaded
      setTimeout(() => renderChessBoard(fen, playerColor), 100);
    }
  } catch (error) {
    console.error('❌ Error rendering chessboard:', error);
  }
}

/**
 * Get board orientation based on player color
 */
function getBoardOrientation(playerColor) {
  return playerColor.toLowerCase() === 'black' ? 'black' : 'white';
}

/**
 * Clear/reset the chessboard (using Chessground)
 */
function clearChessBoard() {
  if (typeof window.cg !== 'undefined') {
    // ✅ PRESERVE legal moves when clearing board
    const currentMovable = window.cg.state.movable;
    updateBoardAndArrows({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      movable: currentMovable
    }, 'clearChessBoard');
    console.log('🧹 Chessboard cleared to starting position');
  }
}

// ====================================================================
// 4.1. UPDATE BOARD AND ARROWS (Required by renderChessBoard)
// ====================================================================
/**
 * Update the Chessground board state and optionally log debug info
 * @param {object} config - Chessground config overrides (fen, orientation, movable, events)
 * @param {string} caller - Optional: who called this function (for debug)
 */
function updateBoardAndArrows(configOverrides = {}, caller = '') {
  if (typeof window.cg === 'undefined') {
    console.error('❌ Chessground instance not available in updateBoardAndArrows');
    return;
  }
  // Merge current state with overrides
  const newConfig = {
    ...window.cg.state,
    ...configOverrides,
    fen: configOverrides.fen || window.cg.state.fen,
    orientation: configOverrides.orientation || window.cg.state.orientation,
    movable: configOverrides.movable || window.cg.state.movable,
    events: configOverrides.events || window.cg.state.events,
    drawable: {
      ...window.cg.state.drawable,
      shapes: window.cg.state.drawable.shapes // preserve existing shapes
    }
  };
  window.cg.set(newConfig);
  if (caller) {
    console.log(`[updateBoardAndArrows] called by ${caller}`);
  }
}

// ====================================================================
// 7. INITIALIZATION (App-Start)
// ====================================================================

/**
 * Initialize the application - start with API test
 */
async function initializeApp() {
  console.log('🚀 Starting app initialization...');
  
  // Test API connection first
  const apiTest = await testAPI();
  
  if (apiTest) {    console.log('✅ App ready - Backend connection successful');
    
    // Load players into dropdown
    await loadPlayers();
    
    // Setup event handlers
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', handleAnalyzeClick);
      console.log('🎯 Analyze button handler attached');
    }
    
    // Setup additional UI event listeners
    setupEventListeners();
    
    // Set initial orientation based on player color
    appState.boardOrientation = getBoardOrientation(appState.currentColor || 'white');
    
  } else {
    console.log('❌ App startup failed - Backend not reachable');
  }
}

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);

/**
 * Apply highlights to board squares (Chessground compatible)
 */
function highlightSquares(squares) {
  console.log('🎨 Applying highlights to squares:', squares);
  
  if (typeof window.cg === 'undefined') {
    console.warn('⚠️ Cannot highlight squares: Chessground not available');
    return;
  }
  
  // Use Chessground's built-in highlight system
  const highlightMap = {};
  squares.forEach(({ square, type }) => {
    if (type === 'from') {
      highlightMap[square] = 'paleBlue'; // Chessground CSS class
    } else if (type === 'to') {
      highlightMap[square] = 'paleGreen'; // Chessground CSS class
    }
  });
  
  window.cg.set({ lastMove: null }); // Clear previous highlights
  // Note: Chessground uses different highlight system - we'll use shapes instead
  console.log(`🎨 Applied highlights using Chessground system`);
}

/**
 * Clear all highlights from board (Chessground compatible)
 */
function clearHighlights() {
  if (typeof window.cg !== 'undefined') {
    // Clear Chessground highlights
    window.cg.set({ lastMove: null });
    console.log('🧹 Cleared highlights using Chessground');
  }
}

// ====================================================================
// 7. MOVE NAVIGATION (Schritt 3)
// ====================================================================

/**
 * Add click event listeners to move items (Schritt 3.2)
 */
function addMoveClickListeners() {
  const moveItems = document.querySelectorAll('.move-item[data-move-index]');
  
  moveItems.forEach(moveItem => {
    moveItem.addEventListener('click', handleMoveClick);
  });
  
  console.log(`✅ Added click listeners to ${moveItems.length} moves`);
}

/**
 * Handle move item click (Schritt 3.3)
 */
async function handleMoveClick(event) {
  const moveIndex = parseInt(event.currentTarget.getAttribute('data-move-index'));
  const move = appState.availableMoves[moveIndex];
  if (!move) {
    console.error('❌ Move not found for index:', moveIndex);
    return;
  }
  console.log('♟️ Move clicked:', formatMoveDisplay(move), 'Index:', moveIndex);
  try {
    appState.isNavigating = true;
    // Save current state for back navigation
    const currentState = {
      fen: appState.currentPosition,
      moves: [...appState.availableMoves],
      stats: {
        games: document.getElementById('statsContent')?.textContent || '',
        position: appState.currentPosition
      },
      nodeId: appState.currentNodeId
    };
    appState.moveHistory.push(currentState);
    // Use node id and move SAN for backend navigation
    const childNode = await sendMoveToBackend(move.san);
    if (childNode) {
      appState.currentPosition = childNode.fen;
      appState.availableMoves = childNode.children
        ? Object.entries(childNode.children).map(([uci, child]) => ({
            uci: uci,
            san: child.move_san,
            color: child.color,
            games: child.games,
            win_rate: child.win_rate
          }))
        : [];
      renderChessBoard(childNode.fen, appState.currentColor);
      if (typeof window.updateLegalMovesFromBackend === 'function') window.updateLegalMovesFromBackend();
      showAvailableMovesArrows(appState.availableMoves || []);
      updateBackButton(true);
    } else {
      console.error('❌ Could not get child node from backend');
    }
  } catch (error) {
    console.error('❌ Error in move navigation:', error);
  } finally {
    appState.isNavigating = false;
  }
}

/**
 * Calculate new board position after a move (Schritt 3.3)
 */
async function calculateNewPosition(currentFen, move) {
  try {
    console.log('🔍 Move object:', move);
    console.log('🔍 Current FEN:', currentFen);
      // Use chess.js to calculate the new position
    // NOTE: For chess.js v1.4.0, we use the global Chess constructor with try/catch for exceptions
    const chess = new Chess(currentFen);
    
    // Check if the position is valid and get legal moves
    console.log('🎯 Legal moves from current position:', chess.moves());
    
    let moveResult = null;
    
    // Strategy 1: Try SAN notation (most reliable for chess players)
    if (move.san) {
      console.log('🎯 Trying SAN move:', move.san);
      try {
        moveResult = chess.move(move.san);
        console.log('✅ SAN move successful:', moveResult);
      } catch (error) {
        console.log('⚠️ SAN move failed:', error.message);
        
        // Special handling for castling notation variations
        if (move.san.includes('O-O') || move.san.includes('0-0')) {
          console.log('🎯 Detected castling move, trying alternative notations...');
          
          // Try both O-O and 0-0 variations for castling
          const castlingVariations = [
            move.san.replace(/0/g, 'O'), // Convert 0-0 to O-O
            move.san.replace(/O/g, '0'), // Convert O-O to 0-0
            move.san // Original notation
          ];
          
          for (const variation of castlingVariations) {
            try {
              moveResult = chess.move(variation);
              console.log(`✅ Castling variation "${variation}" successful:`, moveResult);
              break;
            } catch (variationError) {
              console.log(`⚠️ Castling variation "${variation}" failed:`, variationError.message);
            }
          }
        }
      }
    }
    
    // Strategy 2: Try UCI with explicit object notation
    if (!moveResult && move.uci && move.uci.length === 4) {
      const from = move.uci.substring(0, 2);
      const to = move.uci.substring(2, 4);
      console.log(`🎯 Trying object notation: from ${from} to ${to}`);
      
      try {
        moveResult = chess.move({ from: from, to: to });
        console.log('✅ Object notation successful:', moveResult);
      } catch (error) {
        console.log('⚠️ Object notation failed:', error.message);
      }
    }
      // Strategy 3: Try plain UCI string (chess.js default parsing for v1.4.0)
    if (!moveResult && move.uci) {
      console.log('🎯 Trying UCI string with default parsing:', move.uci);
      try {
        moveResult = chess.move(move.uci); // No sloppy parameter needed in v1.4.0
        console.log('✅ UCI default parsing successful:', moveResult);
      } catch (error) {
        console.log('⚠️ UCI default parsing failed:', error.message);
      }
    }
    
    if (moveResult) {
      const newFen = chess.fen();
      console.log('🎯 New position calculated successfully');
      console.log('📍 New FEN:', newFen.substring(0, 50) + '...');
      return newFen;
    } else {
      console.error('❌ All move formats failed');
      console.log('🔍 Available legal moves:', chess.moves());
      console.log('🔍 Move object that failed:', move);
      
      // Try to help debug
      if (move.uci && move.uci.length === 4) {
        const from = move.uci.substring(0, 2);
        const to = move.uci.substring(2, 4);
        console.log(`🔍 Debugging: Is ${from} a valid square?`, chess.get(from));
        console.log(`🔍 Debugging: Legal moves from ${from}:`, chess.moves({ square: from }));
      }
      
      return null;
    }
    
  } catch (error) {
    console.error('❌ Critical error in calculateNewPosition:', error);
    console.log('🔍 Move object:', move);
    console.log('🔍 FEN string:', currentFen);
    console.log('🔍 Chess constructor available?', typeof Chess);
    return null;
  }
}

/**
 * Load available moves for a new position (Schritt 3.3)
 */
async function loadMovesForPosition(fen) {
  try {
    const response = await fetch('/api/find_moves', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fen: fen,
        player: appState.currentPlayer,
        color: appState.currentColor
      })
    });
    const data = await response.json();
    appState.currentNodeId = data.node_id || null; // Update node id
    await gotoPosition(fen, data.success ? data.moves : [], appState.currentColor);
    console.log('✅ Loaded', data.moves?.length || 0, 'moves for new position');
  } catch (error) {
    appState.currentNodeId = null;
    console.error('❌ Error loading moves for position:', error);
  }
}

/**
 * Highlight the move that was just played (Schritt 3.5 - nur Squares, keine Pfeile)
 */
function highlightPlayedMove(move) {
  // Clear previous highlights
  clearHighlights();
  // clearArrows(); // Entferne alle Pfeile (entfernt)
  // Extract from/to squares from move
  const fromSquare = move.uci ? move.uci.substring(0, 2) : null;
  const toSquare = move.uci ? move.uci.substring(2, 4) : null;
  if (fromSquare && toSquare) {
    setTimeout(() => {
      // Nur Square-Highlights, KEINE Pfeile
      highlightSquares([
        { square: fromSquare, type: 'from' },
        { square: toSquare, type: 'to' }
      ]);
      console.log('🎨 Highlighted move (squares only):', fromSquare, '→', toSquare);
    }, 200);
  }
}

/**
 * Update position statistics display
 */
function updatePositionStats(stats) {
  const statsContent = document.getElementById('statsContent');
  if (statsContent && stats) {
    statsContent.innerHTML = `
      <div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 0.9rem;">
        <div style="background: #f8f9fa; padding: 6px 10px; border-radius: 4px; border: 1px solid #e9ecef;">
          <strong>Games:</strong> ${stats.played || 0}
        </div>
        <div style="background: #f8f9fa; padding: 6px 10px; border-radius: 4px; border: 1px solid #e9ecef;">
          <strong>Win Rate:</strong> ${(stats.win_rate || 0).toFixed(1)}%
        </div>
      </div>
    `;
  }
}

/**
 * Update moves list display
 */
function updateMovesList(moves) {
  const movesList = document.getElementById('movesList');
  if (!movesList) return;
  
  if (moves.length === 0) {
    movesList.innerHTML = '<p style="color: #666; font-style: italic;">No more moves available from this position.</p>';
    return;
  }
    const movesHtml = moves.map((move, index) => {
    // BACKEND-FOKUSSIERT: Use backend-calculated color directly (no frontend calculation)
    const backendColor = move.color || '#888888'; // Backend provides optimal color
    return `
      <div class="move-item" data-move-index="${index}" style="
        display: flex; 
        justify-content: space-between; 
        align-items: center;
        padding: 8px 12px; 
        margin: 4px 0;
        background: ${backendColor}22;
        border-left: 4px solid ${backendColor};
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
      " onmouseover="this.style.backgroundColor='${backendColor}44'" 
         onmouseout="this.style.backgroundColor='${backendColor}22'"
         title="Click to play move | Games: ${move.games} | Wins: ${move.wins} | Draws: ${move.draws} | Losses: ${move.losses}">
        
        <div style="font-weight: 600; font-size: 1rem; color: #333;">
          ${formatMoveDisplay(move)}
        </div>
        
        <div style="display: flex; gap: 12px; align-items: center; font-size: 0.9rem;">
          <span style="color: #666;">${move.games} games</span>
          <span style="color: ${backendColor}; font-weight: 600;">${(move.win_rate || 0).toFixed(1)}%</span>
        </div>
      </div>
    `;
  }).join('');
  
  movesList.innerHTML = movesHtml;
  
  // Re-add click listeners
  addMoveClickListeners();
}

/**
 * Update back button state (Schritt 3.4)
 */
function updateBackButton(enabled) {
  const backBtn = document.getElementById('backBtn');
  if (!backBtn) return;
  
  if (enabled && appState.moveHistory.length > 0) {
    backBtn.disabled = false;
    backBtn.style.background = '#6c757d';
    backBtn.style.color = 'white';
    backBtn.style.cursor = 'pointer';
    backBtn.title = 'Go back to previous position';
    
    // Add click listener if not already added
    if (!backBtn.hasAttribute('data-listener-added')) {
      backBtn.addEventListener('click', handleBackClick);
      backBtn.setAttribute('data-listener-added', 'true');
    }
  } else {
    backBtn.disabled = true;
    backBtn.style.background = '#e9ecef';
    backBtn.style.color = '#6c757d';
    backBtn.style.cursor = 'not-allowed';
    backBtn.title = 'No previous position';
  }
}

/**
 * Handle back button click (Schritt 3.4)
 */
async function handleBackClick() {
  if (appState.moveHistory.length === 0) {
    console.warn('⚠️ No move history to go back to');
    return;
  }
  try {
    const previousState = appState.moveHistory.pop();
    const previousFen = previousState.fen;
    const player = appState.currentPlayer;
    const color = appState.currentColor;
    const response = await fetch('/api/find_moves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player, color, fen: previousFen })
    });
    const data = await response.json();
    appState.currentNodeId = data.node_id || null;
    await gotoPosition(previousFen, data.success ? data.moves : [], color);
    updateBackButton(appState.moveHistory.length > 0);
  } catch (error) {
    appState.currentNodeId = null;
    console.error('❌ [BACK] Error during robust back navigation (in-place):', error);
  }
}

/**
 * Format move display for better readability
 */
function formatMoveDisplay(move) {
  // Always prefer SAN notation - this is what chess players expect!
  if (move.san && move.san.trim() !== '') {
    let san = move.san.trim();
    
    // Ensure consistent castling notation (use O-O format)
    san = san.replace(/0-0-0/g, 'O-O-O');  // Convert 0-0-0 to O-O-O
    san = san.replace(/0-0/g, 'O-O');      // Convert O-O to 0-0 (do this after the above)
    
    return san;
  }
  
  // If no SAN available, try to convert UCI to readable format
  if (move.uci) {
    // Special cases for castling (most common readability issue)
    if (move.uci === 'e1g1') return 'O-O';    // White kingside
    if (move.uci === 'e1c1') return 'O-O-O';  // White queenside
    if (move.uci === 'e8g8') return 'O-O';    // Black kingside
    if (move.uci === 'e8c8') return 'O-O-O';  // Black queenside
    
    // For promotion moves, add promotion piece
    if (move.uci.length === 5) {
      const promotionPiece = move.uci[4].toUpperCase();
      return `${move.uci.substring(0, 4)}=${promotionPiece}`;
    }
    
    // Regular moves: convert e2e4 to e2-e4 for better readability
    if (move.uci.length === 4) {
      return `${move.uci.substring(0, 2)}-${move.uci.substring(2, 4)}`;
    }
    
    // Return UCI as-is if we can't improve it
    return move.uci;
  }
  
  return 'Unknown Move';
}

// ====================================================================
// 8. CHESSGROUND ENHANCED FEATURES (Arrows, Board Control)
// ====================================================================

/**
 * Flip the board orientation (using Chessground)
 */
function flipBoard() {
  if (typeof window.cg === 'undefined') {
    console.warn('⚠️ Cannot flip board: Chessground not available');
    return;
  }
  const currentOrientation = appState.boardOrientation;
  const newOrientation = currentOrientation === 'white' ? 'black' : 'white';
  appState.boardOrientation = newOrientation;
  window.cg.set({ orientation: newOrientation });
  if (typeof window.updateLegalMovesFromBackend === 'function') {
    window.updateLegalMovesFromBackend();
  }
}

/**
 * BUG-FIX: Check if Chessground board is properly initialized and rendered
 */
function isBoardReady() {
  if (!window.cg || !window.cg.state) {
    return false;
  }
  
  // Check if board element has proper dimensions
  const boardElement = document.getElementById('board');
  if (!boardElement) {
    return false;
  }
  
  const rect = boardElement.getBoundingClientRect();
  const hasValidDimensions = rect.width > 0 && rect.height > 0;
  
  if (!hasValidDimensions) {
    console.log(`🔍 BOARD DEBUG: Invalid dimensions - width: ${rect.width}, height: ${rect.height}`);
    return false;
  }
    // Check if Chessground has processed the dimensions
  const cgBoundsFunc = window.cg.state.dom?.bounds;
  if (!cgBoundsFunc || typeof cgBoundsFunc !== 'function') {
    console.log(`🔍 BOARD DEBUG: Chessground bounds function not available:`, cgBoundsFunc);
    return false;
  }
  
  // BUG-FIX: Call the bounds function to get actual dimensions
  let cgBounds;
  try {
    cgBounds = cgBoundsFunc();
  } catch (error) {
    console.log(`🔍 BOARD DEBUG: Error calling bounds function:`, error);
    return false;
  }
  
  if (!cgBounds || cgBounds.width <= 0 || cgBounds.height <= 0) {
    console.log(`🔍 BOARD DEBUG: Chessground bounds not ready:`, cgBounds);
    return false;
  }
  
  console.log(`✅ BOARD DEBUG: Board ready - DOM: ${rect.width}x${rect.height}, CG: ${cgBounds.width}x${cgBounds.height}`);
  return true;
}

/**
 * Add arrow to highlight a move on the board (using Chessground)
 * BUG-FIX: Fixed NaN coordinate issue by using correct Chessground shape format
 */
function addMoveArrow(fromSquare, toSquare, color = '#15781B', opacity = 0.8) {
  if (typeof window.cg === 'undefined') {
    console.warn('⚠️ Cannot add arrow: Chessground not available');
    return null;
  }
    // TODO-CRITICAL: Validate square coordinates before creating shapes
  if (!isValidSquare(fromSquare) || !isValidSquare(toSquare)) {
    console.error(`❌ Invalid squares for arrow: ${fromSquare} -> ${toSquare}`);
    return null;
  }
  
  // BUG-FIX: Check if board is properly rendered with dimensions
  if (!isBoardReady()) {
    console.warn(`⚠️ Board not ready for arrows, retrying in 100ms...`);
    setTimeout(() => addMoveArrow(fromSquare, toSquare, color, opacity), 100);
    return null;
  }
  
  // BUG-FIX: Check if Chessground board is ready before adding arrows
  if (!isBoardReady()) {
    console.warn('⚠️ Chessground board not ready - skipping arrow addition');
    return null;
  }
    try {
    const currentShapes = window.cg.state.drawable.shapes || [];
    const newShape = {
      orig: fromSquare,
      dest: toSquare,
      brush: 'green'  // Chessground uses predefined brush names
    };
    
    // Add shape with proper error handling
    window.cg.setShapes([...currentShapes, newShape]);
    
    return `arrow-${fromSquare}-${toSquare}`; // Return meaningful ID
  } catch (error) {
    console.error('❌ Error adding arrow:', error);
    console.error('Arrow data:', { fromSquare, toSquare, color, opacity });
    console.error('Chessground state:', window.cg?.state);
    return null;
  }
}

/**
 * Clear all arrows from the board (using Chessground)
 */
function clearArrows() {
  if (typeof window.cg === 'undefined') {
    return;
  }
  try {
    // Nur System-Pfeile (system: true) löschen, User-Pfeile erhalten
    const shapes = window.cg.state.drawable.shapes || [];
    const userShapes = shapes.filter(shape => !shape.system);
    window.cg.setShapes(userShapes);
    console.log('🧹 Cleared all system arrows, user arrows remain');
  } catch (error) {
    console.error('❌ Error clearing arrows:', error);
  }
}

/**
 * Add circle to highlight a square (using Chessground shapes)
 */
function addSquareCircle(square, color = '#15781B', opacity = 0.6) {
  if (!window.cg) {
    console.warn('⚠️ Cannot add circle: Chessground not initialized');
    return null;
  }
  
  try {
    // Get current shapes and add new circle
    const currentShapes = window.cg.state.drawable.shapes || [];
    const newShape = {
      orig: square,
      brush: 'green'
    };
    
    // Add the new shape
    window.cg.setShapes([...currentShapes, newShape]);
    
    console.log(`⭕ Added circle on ${square}`);
    return square; // Return square as identifier
  } catch (error) {
    console.error('❌ Error adding circle:', error);
    return null;
  }
}

/**
 * Clear all circles from the board (using Chessground shapes)
 */
function clearCircles() {
  if (!window.cg) {
    return;
  }
  
  try {
    window.cg.setShapes([]);
    console.log('🧹 Cleared all circles');
  } catch (error) {
    console.error('❌ Error clearing circles:', error);
  }
}

// ====================================================================
// 9. EVENT LISTENERS & INITIALIZATION
// ====================================================================

/**
 * Setup UI event listeners
 */
function setupEventListeners() {
  // Flip Board Button
  const flipBtn = document.getElementById('flipBoardBtn');
  if (flipBtn) {
    flipBtn.addEventListener('click', flipBoard);
    console.log('✅ Flip board button event listener added');
  }
  
  // --- NEW: Add listener for the repertoire switch ---
  const saveSwitch = document.getElementById('saveToRepertoireSwitch');
    if (saveSwitch) {
        saveSwitch.addEventListener('change', (event) => {
            const isChecked = event.target.checked;
            console.log(`💾 Save to Repertoire switch changed. New state: ${isChecked ? 'ON' : 'OFF'}`);
            // NEW: Add a class to the parent for styling
            event.target.closest('.toggle-switch').classList.toggle('active', isChecked);
        });
    }
  // --- END NEW ---

  // ====================================================================
  // DRAG & DROP INTEGRATION (Backend-Focused Navigation)
  // ====================================================================
  /**
   * Handle moves from Chessground board (click-to-move)
   * BACKEND-FOKUSSIERT: Validate moves against Backend data, not Chess.js
   * @param {string} from - source square (e.g., 'e2')
   * @param {string} to - destination square (e.g., 'e4')
   */
  async function handleDragDropMove(from, to) {
    console.log(`🖱️ CLICK-TO-MOVE: Processing move ${from} → ${to}`);
    // Prüfe Repertoire-Modus
    const isOwnRepertoire = appState.currentPlayer === 'white_repertoir' || appState.currentPlayer === 'black_repertoir';
    if (isOwnRepertoire) {
      // Erlaube jeden legalen Zug laut chess.js
      const Chess = window.game.constructor;
      const tempGame = new Chess(appState.currentPosition);
      const legalMoves = tempGame.moves({ verbose: true });
      const found = legalMoves.find(m => m.from === from && m.to === to);
      if (!found) {
        showMoveError(`Move ${from}→${to} is not legal in this position (Repertoire-Modus).`);
        renderChessBoard(appState.currentPosition, appState.currentColor);
        return;
      }
      tempGame.move({ from, to });
      const newFen = tempGame.fen();
      const moveSan = found.san;
      console.log('✅ [REPERTOIRE MODUS] Freier Zug gespielt:', from, to, '| Neue FEN:', newFen, '| SAN:', moveSan);
      // --- NEW: Use node_id for backend navigation ---
      const childNode = await sendMoveToBackend(moveSan);
      if (childNode) {
        // Update appState and board with new node info
        appState.currentPosition = childNode.fen;
        appState.availableMoves = childNode.children
          ? Object.entries(childNode.children).map(([uci, child]) => ({
              uci: uci,
              san: child.move_san,
              color: child.color,
              games: child.games,
              win_rate: child.win_rate
            }))
          : [];
        renderChessBoard(childNode.fen, appState.currentColor);
        if (typeof window.updateLegalMovesFromBackend === 'function') window.updateLegalMovesFromBackend();
        showAvailableMovesArrows(appState.availableMoves || []);
      } else {
        // Fallback: just update board with new FEN
        renderChessBoard(newFen, appState.currentColor);
        if (typeof window.updateLegalMovesFromBackend === 'function') window.updateLegalMovesFromBackend();
      }
      return;
    }
    // Standard-Modus: Nur Tree-Züge erlauben
    try {
      const uciMove = from + to;
      const matchingMove = appState.availableMoves.find(move => 
        move.uci === uciMove || 
        (move.uci && move.uci.startsWith(uciMove)) || isEquivalentMove(from, to, move)
      );
      if (matchingMove) {
        const moveIndex = appState.availableMoves.indexOf(matchingMove);
        const mockEvent = {
          currentTarget: {
            getAttribute: (attr) => attr === 'data-move-index' ? moveIndex.toString() : null
          }
        };
        await handleMoveClick(mockEvent);
        console.log(`🖱️ CLICK-TO-MOVE: Move successfully processed via navigation system`);
      } else {
        showMoveError(`Move ${from}→${to} ist im Tree-Modus nicht erlaubt.`);
          renderChessBoard(appState.currentPosition, appState.currentColor);
      }
    } catch (error) {
      console.error('❌ Error processing click-to-move:', error);
      renderChessBoard(appState.currentPosition, appState.currentColor);
      showMoveError('Error processing move. Board reset to current position.');
    }
  }

  /**
   * Check if drag&drop move is equivalent to Backend move
   * ENHANCEMENT: Handle edge cases like castling, en passant, promotion
   */
  function isEquivalentMove(from, to, backendMove) {
    if (!backendMove.uci) return false;
    
    // Handle basic moves
    if (backendMove.uci === from + to) return true;
    
    // Handle promotion moves (e.g., 'e7e8q' matches 'e7→e8')
    if (backendMove.uci.length === 5 && backendMove.uci.startsWith(from + to)) {
      return true;
    }
    
    // TODO-ENHANCEMENT: Handle castling moves (e1g1 → O-O)
    // TODO-ENHANCEMENT: Handle en passant
    
    return false;
  }

  /**
   * Show move error feedback to user
   * TODO-UX: Implement user-friendly error display
   */
  function showMoveError(message) {
    console.warn('🚨 MOVE ERROR:', message);
    
    // TODO-UX: Add visual feedback (toast, highlight, etc.)
    // For now, just log to console
  }

  // Expose function globally for script-cg.js
  window.handleDragDropMove = handleDragDropMove;
}

/**
 * Show arrows for all available next moves (using Backend data!)
 * BUG-FIX: Batch arrow addition to prevent timing conflicts
 */
function showAvailableMovesArrows(moves) {
  // Clear existing system arrows first
  clearArrows();
  
  if (!moves || moves.length === 0) {
    console.log('📍 No moves available - no arrows to show');
    return;
  }
  
  console.log('🏹 Showing arrows for', moves.length, 'available moves (using backend data)');
  
  // BUG-FIX: Wait for board to be ready before adding any arrows
  if (!isBoardReady()) {
    console.warn('⚠️ Board not ready for arrows, retrying showAvailableMovesArrows in 200ms...');
    setTimeout(() => showAvailableMovesArrows(moves), 200);
    return;
  }
  
  // BUG-FIX: Batch all arrows into a single setShapes call
  const currentShapes = window.cg.state.drawable.shapes || [];
  const newArrows = [];
  
  moves.forEach((move, index) => {
    const fromSquare = move.uci ? move.uci.substring(0, 2) : null;
    const toSquare = move.uci ? move.uci.substring(2, 4) : null;
      if (fromSquare && toSquare && isValidSquare(fromSquare) && isValidSquare(toSquare)) {      // Use backend color with frontend brush mapping
      const backendColor = move.color || '#9e9e9e';
      const brushName = window.getChessgroundBrush ? 
        window.getChessgroundBrush(backendColor, appState.currentPlayer === 'My Repertoire') : 
        'nodata';
      
      // Create arrow shape
      newArrows.push({
        orig: fromSquare,
        dest: toSquare,
        brush: brushName,
        system: true
      });
      
      console.log(`🏹 Arrow ${index + 1}: ${fromSquare}→${toSquare} | Backend Color: ${backendColor} | Brush: ${brushName} | Games: ${move.games} | Win%: ${move.win_rate?.toFixed(1)}%`);
    }
  });
  
  // BUG-FIX: Add all arrows in one batch operation
  try {
    // User-Pfeile erhalten, System-Pfeile hinzufügen
    const userShapes = currentShapes.filter(shape => !shape.system);
    window.cg.setShapes([...userShapes, ...newArrows]);
    console.log(`✅ All ${newArrows.length} available move arrows displayed with backend intelligence, user arrows preserved`);
  } catch (error) {
    console.error('❌ Error adding batch arrows:', error);
    console.error('Arrow data:', newArrows);
  }
}

// ====================================================================
// DEBUG FUNCTIONS (for testing castling and move processing)
// ====================================================================

/**
 * Debug function to test castling move processing
 * Call this from browser console: testCastlingMoves()
 */
window.testCastlingMoves = function() {
  console.log('🧪 Testing castling move processing...');
  
  const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const castlingReadyFen = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';
  
  // Test moves with different castling notations
  const testMoves = [
    { san: 'O-O', uci: 'e1g1', description: 'White kingside with O-O' },
    { san: '0-0', uci: 'e1g1', description: 'White kingside with 0-0' },
    { san: 'O-O-O', uci: 'e1c1', description: 'White queenside with O-O-O' },
    { san: '0-0-0', uci: 'e1c1', description: 'White queenside with 0-0-0' }
  ];
  
  testMoves.forEach(async (move, index) => {
    console.log(`\n🧪 Test ${index + 1}: ${move.description}`);
    console.log('   Move object:', move);
    
    try {
      const result = await calculateNewPosition(castlingReadyFen, move);
      if (result) {
        console.log('   ✅ Move processed successfully');
        console.log('   📍 Result FEN:', result.substring(0, 50) + '...');
      } else {
        console.log('   ❌ Move processing failed');
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
    }
    
    // Test display formatting
    const displayText = formatMoveDisplay(move);
    console.log('   📝 Display text:', displayText);
  });
  
  console.log('\n🧪 Castling tests completed!');
};

/**
 * Debug function to test chess.js castling support directly
 * Call this from browser console: testChessJsCastling()
 */
window.testChessJsCastling = function() {
  console.log('🧪 Testing chess.js castling support directly...');
  
  const chess = new Chess('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
  
  console.log('📋 Legal moves:', chess.moves());
  
  // Test different castling notations
  const notations = ['O-O', '0-0', 'O-O-O', '0-0-0'];
  
  notations.forEach(notation => {
    const testChess = new Chess('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
    try {
      const result = testChess.move(notation);
      console.log(`✅ ${notation} works:`, result ? result.san : 'null');
    } catch (error) {
      // handle error or leave empty
    }
  });
}

// ====================================================================
// 0.1. UPDATE LEGAL MOVES FROM BACKEND OR REPERTOIRE (CRITICAL)
// ====================================================================
window.updateLegalMovesFromBackend = function() {
  if (typeof window.cg === 'undefined') {
    console.warn('⚠️ Chessground not initialized, cannot update legal moves');
    return;
  }
  const isOwnRepertoire = appState.currentPlayer === 'white_repertoir' || appState.currentPlayer === 'black_repertoir';
  let dests = new Map();
  if (isOwnRepertoire) {
    // Allow all legal moves from chess.js
    const Chess = window.game.constructor;
    const chess = new Chess(appState.currentPosition);
    const legalMoves = chess.moves({ verbose: true });
    for (const move of legalMoves) {
      if (!dests.has(move.from)) dests.set(move.from, []);
      dests.get(move.from).push(move.to);
    }
    console.log('[REPERTOIRE MODUS] All legal moves allowed:', dests);
  } else {
    // Only allow moves from appState.availableMoves (tree mode)
    for (const move of appState.availableMoves || []) {
      if (move.uci && move.uci.length >= 4) {
        const from = move.uci.substring(0, 2);
        const to = move.uci.substring(2, 4);
        if (!dests.has(from)) dests.set(from, []);
        dests.get(from).push(to);
      }
    }
    console.log('[TREE MODUS] Only tree moves allowed:', dests);
  }
  window.cg.set({
    movable: {
      ...window.cg.state.movable,
      dests: dests,
      color: 'both',
      free: false,
      showDests: true
    }
  });
};

// Helper: Ensure node_id is set for the current position (fetch if missing)
async function ensureNodeIdForCurrentPosition() {
  if (appState.currentNodeId) return appState.currentNodeId;
  console.warn('[ensureNodeIdForCurrentPosition] node_id missing, fetching from backend for FEN:', appState.currentPosition);
  try {
    const response = await fetch('/api/find_moves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fen: appState.currentPosition,
        player: appState.currentPlayer,
        color: appState.currentColor
      })
    });
    const data = await response.json();
    appState.currentNodeId = data.node_id || null;
    console.log('[ensureNodeIdForCurrentPosition] node_id set to', appState.currentNodeId);
    return appState.currentNodeId;
  } catch (e) {
    appState.currentNodeId = null;
    console.error('[ensureNodeIdForCurrentPosition] Failed to fetch node_id:', e);
    return null;
  }
}

// Refactor move handling to use node_id for backend communication
// (Add this as a new function for now, to be used in Repertoire-Modus and later for all modes)
async function sendMoveToBackend(moveSan) {
  // Always ensure node_id is set before sending move
  if (!appState.currentNodeId) {
    await ensureNodeIdForCurrentPosition();
  }
  if (!appState.currentNodeId || !moveSan) {
    console.warn('⚠️ Cannot send move to backend: missing node_id or moveSan', { nodeId: appState.currentNodeId, moveSan });
    return null;
  }
  try {
    console.log('[sendMoveToBackend] Sending move to backend', { nodeId: appState.currentNodeId, moveSan });
    const response = await fetch('/api/get_child_node', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        node_id: appState.currentNodeId,
        move_san: moveSan
      })
    });
    const data = await response.json();
    if (data.success && data.child) {
      appState.currentNodeId = data.child.id;
      console.log('[sendMoveToBackend] Move accepted, new node_id:', appState.currentNodeId);
      return data.child;
    }
    console.warn('[sendMoveToBackend] Backend did not return a child node', data);
    return null;
  } catch (e) {
    console.error('❌ Error sending move to backend:', e);
    return null;
  }
}