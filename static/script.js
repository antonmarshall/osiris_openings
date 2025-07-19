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
    let selectable = false;
    if (typeof window.appState !== 'undefined' && window.appState.availableMoves) {
      const availableFromSquares = new Set();
      window.appState.availableMoves.forEach(move => {
        if (move.uci && move.uci.length >= 4) {
          availableFromSquares.add(move.uci.substring(0, 2));
        }
      });
      selectable = availableFromSquares.has(square);
    }
  }
  function onMove(from, to) {
    if (typeof window.handleDragDropMove === 'function') {
      window.handleDragDropMove(from, to);
    } else {
      const result = game.move({ from, to });
      if (!result) {
        cg.set({ fen: game.fen(), movable: { free: false, color: config.movable.color }, drawable: { ...cg.state.drawable, shapes: cg.state.drawable.shapes } });
        return;
      }
      cg.set({ fen: game.fen(), lastMove: [from, to], drawable: { ...cg.state.drawable, shapes: cg.state.drawable.shapes } });
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
        repertoire: { key: 'repertoire', color: '#4caf50', opacity: 1.0, lineWidth: 8 },
        tip: { key: 'tip', color: '#ff9800', opacity: 1.0, lineWidth: 8 }
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
  currentNodeId: null, // <--- NEU: Aktuelle Node-ID
  currentNodeParentId: null, // <--- NEU: Parent Node-ID für Back-Navigation
  currentArrows: [], // <--- Store current system arrows
  // --- Training Mode State ---
  trainingMode: false,       // <--- NEU: Training mode flag
  isOpponentTurn: false,     // <--- NEU: Whose turn in training
  trainingHistory: [],       // <--- NEU: Training move history
  // --- Learning Status State ---
  trainingSessionId: null,   // <--- NEU: Session tracking
  studiedNodes: new Set(),   // <--- NEU: Track studied nodes
  unstudiedMovesOnly: true,  // <--- NEU: Filter mode
  directlyLearnedNodes: new Set(), // <--- NEU: Direkt gelernte Züge
  mistakeCount: 0,           // <--- NEU: Fehlerzähler
  errorCountPerPosition: {} // <--- NEU: Fehlerzähler pro Stellung
};

// Add to global appState
appState.trainingCompleted = false;

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
      backToRepBtn.textContent = 'Back to repertoire';
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
    const response = await fetch('/api/players');
    const data = await response.json();
    return data;
  } catch (error) {
    return null;
  }
}

/**
 * Load players and populate dropdown
 */
async function loadPlayers() {
  try {
    const data = await testAPI();
    
    if (!data || !data.success) {
      return;
    }
    
    const select = document.getElementById('playerSelect');
    if (!select) {
      return;
    }
    
    // Clear existing options
    select.innerHTML = '';
    
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select player...';
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
  appState.moveHistory = [];
  appState.isNavigating = false;
  
  // Show the results section
  const resultsSection = document.getElementById('analysisResults');
  if (!resultsSection) {
    return;
  }
  
  resultsSection.style.display = 'block';
  
  // Update position info
  const positionInfo = document.getElementById('positionInfo');
  if (positionInfo) {
    positionInfo.innerHTML = `
      <strong>Player:</strong> ${playerName} (${color}) | 
      <strong>Position:</strong> ${data.position}
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
    // Update moves list (centralized)
  const isOwnRepertoire = ['my repertoire', 'white_repertoir', 'black_repertoir'].includes((playerName || '').toLowerCase());
  renderMoveList(data.moves || [], { allowDelete: isOwnRepertoire, logSource: 'displayAnalysisResults' });
    // Render chess board with current position
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
    const playerSelect = document.getElementById('playerSelect');
    const selectedPlayer = playerSelect.value;
    
    if (!selectedPlayer) {
      alert('Please select a player!');
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
    
    // Make API call
    const response = await fetch(`/api/process_games/${selectedPlayer}?color=${selectedColor}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
      if (data.success) {
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
// 3.1. REPERTOIRE BUTTON HANDLERS
// ====================================================================

/**
 * Handle "Repertoire ansehen/bearbeiten" button click
 * Sets player to "My Repertoire" and starts analysis
 */
async function handleViewRepertoireClick() {
  try {
    // Get selected color from repertoire container
    const colorRadios = document.getElementsByName('repertoireColorSelect');
    let selectedColor = 'white'; // default
    for (const radio of colorRadios) {
      if (radio.checked) {
        selectedColor = radio.value;
        break;
      }
    }
    
    // Set the player dropdown to "My Repertoire"
    const playerSelect = document.getElementById('playerSelect');
    if (playerSelect) {
      // Find and select "My Repertoire" option
      for (let i = 0; i < playerSelect.options.length; i++) {
        if (playerSelect.options[i].text.toLowerCase().includes('my repertoire')) {
          playerSelect.selectedIndex = i;
          break;
        }
      }
    }
    
    // Set the color radio buttons in the left container
    const leftColorRadios = document.getElementsByName('colorSelect');
    for (const radio of leftColorRadios) {
      radio.checked = radio.value === selectedColor;
    }
    
    // Start analysis (same as handleAnalyzeClick)
    const response = await fetch(`/api/process_games/My Repertoire?color=${selectedColor}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      displayAnalysisResults(data, 'My Repertoire', selectedColor);
    } else {
      console.error('❌ Repertoire analysis failed');
    }
    
  } catch (error) {
    console.error('❌ Error during repertoire analysis:', error);
  }
}

/**
 * Handle "Repertoire trainieren" button click
 * Starts training mode with My Repertoire
 */
async function handleTrainRepertoireClick() {
  try {
    // Get selected color from repertoire container
    const colorRadios = document.getElementsByName('repertoireColorSelect');
    let selectedColor = 'white'; // default
    for (const radio of colorRadios) {
      if (radio.checked) {
        selectedColor = radio.value;
        break;
      }
    }
    
    // Start training mode
    await startTrainingMode(selectedColor);
    
  } catch (error) {
    console.error('❌ Error starting training mode:', error);
  }
}

// ====================================================================
// 3.2. TRAINING MODE FUNCTIONS
// ====================================================================

/**
 * Start training mode
 */
async function startTrainingMode(playerColor) {
  try {
    console.log('🎯 Starting training mode...');
    // Set training mode state
    appState.trainingMode = true;
    appState.currentColor = playerColor;
    appState.currentPlayer = 'My Repertoire';
    // Generate unique session ID for learning tracking (NEU: VOR Backend-Call!)
    appState.trainingSessionId = `training_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    // Determine who starts based on player color
    appState.isOpponentTurn = (playerColor === 'black');
    console.log('🎯 Training mode initialized:', {
      playerColor: playerColor,
      isOpponentTurn: appState.isOpponentTurn,
      trainingMode: appState.trainingMode
    });
    // Load the repertoire tree (same as view repertoire)
    let processGamesUrl = `/api/process_games/My Repertoire?color=${playerColor}`;
    if (appState.trainingSessionId) {
      processGamesUrl += `&session_id=${encodeURIComponent(appState.trainingSessionId)}`;
    }
    const response = await fetch(processGamesUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error('Failed to load repertoire tree');
    }
    appState.studiedNodes.clear();
    // Initialize training state
    appState.currentPosition = data.position;
    appState.availableMoves = data.moves || [];
    appState.currentNodeId = data.node_id || null;
    appState.trainingHistory = [];
    // Show training mode UI first (this makes the board visible)
    showTrainingModeUI();
    // Wait a moment for UI to be ready, then render board
    setTimeout(() => {
      renderChessBoard(data.position, playerColor);
      showAvailableMovesArrows([]); // No arrows in training mode
      // If opponent starts, play first move
      if (appState.isOpponentTurn) {
        // Add timeout protection for opponent move
        window.trainingTimeout = setTimeout(async () => {
          try {
            await playOpponentMove();
          } catch (error) {
            console.error('❌ Timeout error in opponent move:', error);
            appState.isOpponentTurn = false;
            showTrainingFeedback('Opponent move timeout - your turn', 'error');
            updateTrainingStatus();
          }
        }, 1000);
      }
    }, 100);
    console.log('✅ Training mode started successfully');
    appState.trainingCompleted = false; // Reset on training start
  } catch (error) {
    console.error('❌ Error starting training mode:', error);
    alert('Fehler beim Starten des Trainingsmodus: ' + error.message);
  }
}

/**
 * Handle training mode move
 */
async function handleTrainingMove(from, to) {
  if (!appState.trainingMode || appState.isOpponentTurn || appState.trainingCompleted) {
    return;
  }
  // --- Immer zu Beginn: Alle Pfeile entfernen (auch Tipp-Pfeile) ---
  showAvailableMovesArrows([], { force: true });
  // clearHighlights(); // No longer needed here
  try {
    console.log(`🎯 Training move: ${from} → ${to}`);
    // Validate current state
    if (!appState.currentPosition || !appState.trainingSessionId) {
      showTrainingFeedback('Training state error - please restart training', 'error');
      clearHighlights();
      return;
    }
    // Get move SAN using chess.js
    const Chess = window.game.constructor;
    const tempGame = new Chess(appState.currentPosition);
    const legalMoves = tempGame.moves({ verbose: true });
    const found = legalMoves.find(m => m.from === from && m.to === to);
    if (!found) {
      showTrainingFeedback(`${from}→${to} is not a legal move!`, 'error');
      clearHighlights();
      return;
    }
    const moveSan = found.san;
    // STEP 1: Play the move visually on the board first
    tempGame.move({ from, to });
    const newFen = tempGame.fen();
    renderChessBoard(newFen, appState.currentColor);
    highlightPlayedMove({ uci: from + to }); // Highlight after valid move
    // STEP 2: Check if move exists in repertoire
    const moveExists = await checkMoveInRepertoire(moveSan);
    if (moveExists) {
      // --- Nach korrektem Zug: Fehlerzähler für aktuelle Stellung zurücksetzen ---
      appState.errorCountPerPosition[appState.currentPosition] = 0;
      
      // Hole die Node-ID für den gespielten Zug
      const childNode = await sendMoveToBackend(moveSan);
      if (childNode) {
        updateAppStateWithNode(childNode);
        const alreadyLearned = appState.directlyLearnedNodes.has(childNode.id);
        
        // Hole alle noch nicht gelernten eigenen Repertoire-Züge
        const unstudiedMoves = await getUnstudiedMoves(appState.trainingSessionId, appState.currentPosition);
        const unstudiedOwnMoves = (unstudiedMoves || []).filter(m => m.is_in_repertoire !== false);
        
        if (alreadyLearned) {
          let msg = '✅ Der Zug ist in deinem Repertoire, aber du hast ihn bereits gelernt.';
          if (unstudiedOwnMoves.length > 0) {
            msg += ' Es gibt noch weitere offene Züge! <button id=\'showUnlearnedMovesBtn\' style=\'margin-left:12px;padding:4px 10px;font-size:0.95rem;\'>zeige offene Züge</button>';
          } else {
            msg += ' Alle Züge aus dieser Stellung gelernt!';
          }
          showTrainingFeedback(msg, 'info');
          setTimeout(() => {
            const btn = document.getElementById('showUnlearnedMovesBtn');
            if (btn) {
              btn.onclick = async () => {
                showAvailableMovesArrows(unstudiedOwnMoves);
                showTrainingFeedback('Unlearned moves are now shown!', 'info');
              };
            }
          }, 100);
          return;
        }
        
        // --- Normale Lernlogik, wenn Zug noch nicht gelernt ---
        showTrainingFeedback(`Correct! ${moveSan} is in your repertoire!`, 'success');
        appState.trainingHistory.push({
          position: appState.currentPosition,
          move: moveSan,
          correct: true
        });
        
        if (!childNode.children || Object.keys(childNode.children).length === 0) {
          await markCurrentNodeAsStudiedIfEndOfLine();
          showTrainingFeedback('Line learned! Returning to start position...', 'success');
          
          // Use a more robust timeout with error handling
          window.trainingTimeout = setTimeout(async () => {
            try {
              await returnToStartPosition();
              await checkIfTrainingComplete();
            } catch (error) {
              console.error('❌ Error returning to start position:', error);
              showTrainingFeedback('Error returning to start - please restart training', 'error');
            }
          }, 2000);
          
          updateTrainingStatus();
          return;
        }
        
        updateTrainingStatus();
        appState.isOpponentTurn = true;
        
        // Use a more robust timeout with error handling
        window.trainingTimeout = setTimeout(async () => {
          try {
            await playOpponentMove();
          } catch (error) {
            console.error('❌ Error in opponent move timeout:', error);
            // Recovery: reset turn and show error
            appState.isOpponentTurn = false;
            showTrainingFeedback('Opponent move error - your turn again', 'error');
            updateTrainingStatus();
          }
        }, 1500);
        
        return;
      } else {
        // Recovery: if sendMoveToBackend fails, reset the board and continue
        console.warn('⚠️ sendMoveToBackend failed, resetting board');
        renderChessBoard(appState.currentPosition, appState.currentColor);
        showTrainingFeedback('Move processing error - try again', 'error');
        return;
      }
    }
    
    // ❌ NEGATIVE FEEDBACK - Move not in repertoire
    // --- Fehlerzähler für aktuelle Stellung erhöhen ---
    const fen = appState.currentPosition;
    if (!appState.errorCountPerPosition[fen]) {
      appState.errorCountPerPosition[fen] = 1;
    } else {
      appState.errorCountPerPosition[fen] += 1;
    }
    const errorCount = appState.errorCountPerPosition[fen];
    showTrainingFeedback(`${moveSan} is not in your repertoire!`, 'error');
    
    setTimeout(() => {
      renderChessBoard(appState.currentPosition, appState.currentColor);
    }, 1000);
    
    appState.trainingHistory.push({
      position: appState.currentPosition,
      move: moveSan,
      correct: false
    });
    
    // --- Nach dem zweiten oder weiteren Fehlern: Offene Züge als Tipp-Pfeile markieren ---
    if (errorCount >= 2) {
      try {
        const unstudiedMoves = await getUnstudiedMoves(appState.trainingSessionId, appState.currentPosition);
        const unstudiedOwnMoves = (unstudiedMoves || []).filter(m => m.is_in_repertoire !== false);
        if (unstudiedOwnMoves.length > 0) {
          showAvailableMovesArrows(unstudiedOwnMoves, { force: true, type: 'tip' });
          showTrainingFeedback('Tip: These moves are still open!', 'info');
        }
      } catch (error) {
        console.error('❌ Error showing tip arrows:', error);
      }
    }
    
    updateTrainingStatus();
    
  } catch (error) {
    console.error('❌ Error in training move:', error);
    showTrainingFeedback('Error processing move!', 'error');
    
    // Recovery: reset board to current position
    try {
      renderChessBoard(appState.currentPosition, appState.currentColor);
    } catch (boardError) {
      console.error('❌ Error resetting board:', boardError);
    }
  }
}

/**
 * Play opponent move (random from tree)
 */
async function playOpponentMove() {
  if (!appState.trainingMode || !appState.isOpponentTurn || appState.trainingCompleted) {
    return;
  }
  
  try {
    // Get unstudied moves from current position
    let availableMoves = [];
    try {
      if (appState.trainingSessionId && appState.unstudiedMovesOnly) {
        availableMoves = await getUnstudiedMoves(appState.trainingSessionId, appState.currentPosition);
      } else {
        availableMoves = appState.availableMoves || [];
      }
    } catch (error) {
      availableMoves = appState.availableMoves || [];
    }
    
    if (!availableMoves || availableMoves.length === 0) {
      await markCurrentNodeAsStudiedIfEndOfLine();
      showTrainingFeedback('All moves from this position learned!', 'success');
      appState.isOpponentTurn = false;
      
      setTimeout(async () => {
        try {
          await returnToStartPosition();
          await checkIfTrainingComplete();
        } catch (error) {
          console.error('❌ Error returning to start position:', error);
          showTrainingFeedback('Error returning to start - please restart training', 'error');
        }
      }, 2000);
      return;
    }
    
    // Select random move from unstudied moves
    const randomIndex = Math.floor(Math.random() * availableMoves.length);
    const selectedMove = availableMoves[randomIndex];
    
    if (!selectedMove || !selectedMove.san) {
      appState.isOpponentTurn = false;
      showTrainingFeedback('Opponent move error - your turn', 'error');
      updateTrainingStatus();
      return;
    }
    
    const childNode = await sendMoveToBackend(selectedMove.san);
    if (childNode) {
      updateAppStateWithNode(childNode);
      
      // Nach Gegnerzug prüfen, ob die Linie zu Ende ist
      let nextMoves = [];
      try {
        if (appState.trainingSessionId && appState.unstudiedMovesOnly) {
          nextMoves = await getUnstudiedMoves(appState.trainingSessionId, appState.currentPosition);
        } else {
          nextMoves = appState.availableMoves || [];
        }
      } catch (error) {
        nextMoves = appState.availableMoves || [];
      }
      
      if (!nextMoves || nextMoves.length === 0) {
        await markCurrentNodeAsStudiedIfEndOfLine();
        appState.isOpponentTurn = false;
        showTrainingFeedback('Line completed!', 'success');
        
        window.trainingTimeout = setTimeout(async () => {
          try {
            await returnToStartPosition();
            await checkIfTrainingComplete();
          } catch (error) {
            console.error('❌ Error returning to start position:', error);
            showTrainingFeedback('Error returning to start - please restart training', 'error');
          }
        }, 2000);
        return;
      }
      
      appState.isOpponentTurn = false;
      updateTrainingStatus();
    } else {
      // Recovery: if sendMoveToBackend fails, reset turn
      console.error('❌ sendMoveToBackend failed for opponent move');
      appState.isOpponentTurn = false;
      showTrainingFeedback('Opponent move error - your turn', 'error');
      updateTrainingStatus();
    }
    
  } catch (error) {
    console.error('❌ Error in opponent move:', error);
    showTrainingFeedback('Error in opponent move!', 'error');
    
    // Recovery: reset turn and continue
    appState.isOpponentTurn = false;
    updateTrainingStatus();
  }
}

/**
 * Show training feedback message
 */
function showTrainingFeedback(message, type) {
  if (appState.trainingCompleted && type !== 'success') return; // Only allow final congrats
  // Emoji zentral je nach Typ
  let emoji = '';
  switch (type) {
    case 'success': emoji = '✅ '; break;
    case 'error': emoji = '❌ '; break;
    case 'info': emoji = 'ℹ️ '; break;
    default: emoji = '';
  }
  // Feedback-Box dynamisch erzeugen, falls nicht vorhanden
  let feedbackBox = document.getElementById('trainingFeedbackBox');
  if (!feedbackBox) {
    feedbackBox = document.createElement('div');
    feedbackBox.id = 'trainingFeedbackBox';
    feedbackBox.setAttribute('role', 'status');
    feedbackBox.setAttribute('aria-live', 'polite');
    feedbackBox.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      min-width: 260px;
      max-width: 350px;
      padding: 16px 20px 16px 20px;
      border-radius: 8px;
      font-weight: 600;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: none;
      opacity: 0;
      transition: opacity 0.4s, transform 0.4s;
      font-size: 1.08rem;
      pointer-events: auto;
    `;
    // Close-Button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.style.cssText = `
      position: absolute;
      top: 8px;
      right: 12px;
      background: none;
      border: none;
      font-size: 1.3rem;
      color: #888;
      cursor: pointer;
      padding: 0;
    `;
    closeBtn.onclick = () => {
      feedbackBox.style.opacity = '0';
      setTimeout(() => { feedbackBox.style.display = 'none'; }, 400);
    };
    feedbackBox.appendChild(closeBtn);
    document.body.appendChild(feedbackBox);
  }
  // Set content
  feedbackBox.className = 'feedback-' + type;
  // Remove old message span if present
  let oldMsg = feedbackBox.querySelector('.feedback-message');
  if (oldMsg) feedbackBox.removeChild(oldMsg);
  const msgSpan = document.createElement('span');
  msgSpan.className = 'feedback-message';
  msgSpan.textContent = emoji + message;
  feedbackBox.appendChild(msgSpan);
  // Farben je nach Typ
  let bg = '#f8f9fa', color = '#333', border = '#e0e0e0';
  if (type === 'success') { bg = '#d5f4e6'; color = '#1e8449'; border = '#27ae60'; }
  if (type === 'error')   { bg = '#fadbd8'; color = '#c0392b'; border = '#e74c3c'; }
  if (type === 'info')    { bg = '#d6eaf8'; color = '#21618c'; border = '#3498db'; }
  feedbackBox.style.background = bg;
  feedbackBox.style.color = color;
  feedbackBox.style.border = `2px solid ${border}`;
  // Show with fade-in
  feedbackBox.style.display = 'block';
  setTimeout(() => { feedbackBox.style.opacity = '1'; feedbackBox.style.transform = 'translateY(0)'; }, 10);
  // Auto-hide after 3.5s (unless mouse is over box)
  let hideTimeout = feedbackBox.hideTimeout;
  if (hideTimeout) clearTimeout(hideTimeout);
  feedbackBox.onmouseenter = () => { if (feedbackBox.hideTimeout) clearTimeout(feedbackBox.hideTimeout); };
  feedbackBox.onmouseleave = () => {
    feedbackBox.hideTimeout = setTimeout(() => {
      feedbackBox.style.opacity = '0';
      setTimeout(() => { feedbackBox.style.display = 'none'; }, 400);
    }, 2000);
  };
  feedbackBox.hideTimeout = setTimeout(() => {
    feedbackBox.style.opacity = '0';
    setTimeout(() => { feedbackBox.style.display = 'none'; }, 400);
  }, 3500);
}

/**
 * Show training mode UI
 */
function showTrainingModeUI() {
  console.log('🎯 Setting up training mode UI...');
  
  // Show analysis results section (contains the board)
  const analysisResults = document.getElementById('analysisResults');
  if (analysisResults) {
    analysisResults.style.display = 'block';
    console.log('✅ Analysis results section made visible');
  }
  
  // Update position info for training mode
  const positionInfo = document.getElementById('positionInfo');
  if (positionInfo) {
    positionInfo.innerHTML = `
      <strong>🎯 Training Mode:</strong> My Repertoire (${appState.currentColor}) | 
      <strong>Position:</strong> ${appState.currentPosition.substring(0, 30)}...
    `;
  }
  
  // Update section title
  const resultsHeader = analysisResults?.querySelector('.results-header h3');
  if (resultsHeader) {
    resultsHeader.textContent = '🎯 Repertoire Training';
  }
  
  // Hide training mode indicator (removed as requested)
  // Note: Training mode indicator was removed from top-left
  
  // Hide save to repertoire switch in training mode
  const saveSwitch = document.getElementById('saveToRepertoireSwitch');
  const saveSwitchLabel = saveSwitch?.closest('.switch-label');
  if (saveSwitchLabel) {
    saveSwitchLabel.style.display = 'none';
  }
  
  // Create training feedback area
  let feedbackDiv = document.getElementById('trainingFeedback');
  if (!feedbackDiv) {
    feedbackDiv = document.createElement('div');
    feedbackDiv.id = 'trainingFeedback';
    feedbackDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 20px;
      border-radius: 8px;
      font-weight: 600;
      z-index: 1000;
      display: none;
      min-width: 280px;
      max-width: 350px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: all 0.3s ease;
    `;
    document.body.appendChild(feedbackDiv);
  }
  
  // Create end training button
  let endTrainingBtn = document.getElementById('endTrainingBtn');
  if (!endTrainingBtn) {
    endTrainingBtn = document.createElement('button');
    endTrainingBtn.id = 'endTrainingBtn';
    endTrainingBtn.textContent = '🏁 Training beenden';
    endTrainingBtn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #e74c3c;
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(231, 76, 60, 0.3);
    `;
    endTrainingBtn.addEventListener('click', endTrainingMode);
    document.body.appendChild(endTrainingBtn);
  }
  endTrainingBtn.style.display = 'block';
  
  // Add reset training button
  addTrainingResetButton();
  
  // Update moves section for training mode
  const movesSection = document.getElementById('movesSection');
  if (movesSection) {
    const movesHeader = movesSection.querySelector('h4');
    if (movesHeader) {
      movesHeader.textContent = '🎯 Training Status';
    }
    // Use central renderMoveList for training mode
    renderMoveList([], { mode: 'training', logSource: 'showTrainingModeUI' });
  }
  
  console.log('✅ Training mode UI setup complete');
  
  // Update training status
  updateTrainingStatus();
}

/**
 * Update training status display
 */
async function updateTrainingStatus() {
  if (!appState.trainingMode) return;
  // Use central renderMoveList for training mode status
  renderMoveList([], { mode: 'training', logSource: 'updateTrainingStatus' });
}

/**
 * End training mode
 */
function endTrainingMode() {
  console.log('🏁 Ending training mode...');
  
  // Reset training state
  appState.trainingMode = false;
  appState.isOpponentTurn = false;
  appState.trainingHistory = [];
  
  // Hide training UI elements
  // Training mode indicator was removed
  
  // Show save to repertoire switch again
  const saveSwitch = document.getElementById('saveToRepertoireSwitch');
  const saveSwitchLabel = saveSwitch?.closest('.switch-label');
  if (saveSwitchLabel) {
    saveSwitchLabel.style.display = 'flex';
  }
  
  const feedbackDiv = document.getElementById('trainingFeedback');
  if (feedbackDiv) {
    feedbackDiv.style.display = 'none';
  }
  
  const endTrainingBtn = document.getElementById('endTrainingBtn');
  if (endTrainingBtn) {
    endTrainingBtn.style.display = 'none';
  }
  
  // Remove reset training button
  removeTrainingResetButton();
  
  // Reset analysis results section
  const analysisResults = document.getElementById('analysisResults');
  if (analysisResults) {
    analysisResults.style.display = 'none';
  }
  
  // Reset section titles
  const resultsHeader = analysisResults?.querySelector('.results-header h3');
  if (resultsHeader) {
    resultsHeader.textContent = 'Opening Analysis Results';
  }
  
  const movesHeader = document.querySelector('#movesSection h4');
  if (movesHeader) {
    movesHeader.textContent = 'Available Moves';
  }
  
  // Clear moves list using central function
  renderMoveList([], { logSource: 'endTrainingMode', emptyMessage: 'Please select a player and start the analysis.' });
  
  // Show end training feedback
  showTrainingFeedback('🏁 Training beendet!', 'info');
}

// ====================================================================
// 4. CHESS BOARD RENDERING
// ====================================================================

// ====================================================================
// 4. CHESS BOARD RENDERING (Using Chessground from script-cg.js)
// ====================================================================

// Note: Chessground board instance is managed in script-cg.js as window.cg

/**
 * Render a chess position from FEN string (using Chessground)
 */
function renderChessBoard(fen, playerColor = 'white') {
  try {
    clearHighlights();
    console.log('[BOARD] renderChessBoard | FEN:', fen, '| Color:', playerColor);
    if (typeof window.cg !== 'undefined') {
      const orientation = appState.boardOrientation;
      const currentMovable = window.cg.state.movable;
      let events = window.cg.state.events;
      if (!events && window.chessgroundConfig) {
        events = window.chessgroundConfig.events;
      }
      updateBoardAndArrows({
        fen: fen,
        orientation: orientation,
        movable: currentMovable,
        events: events
      }, 'renderChessBoard');
      if (typeof window.updateLegalMovesFromBackend === 'function') window.updateLegalMovesFromBackend();
    } else {
      console.error('[ERROR] Chessground instance not available - waiting for script-cg.js');
      setTimeout(() => renderChessBoard(fen, playerColor), 100);
    }
  } catch (error) {
    console.error('[ERROR] renderChessBoard:', error);
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
    // Initialize move list with central function for UI consistency
    renderMoveList([], { logSource: 'initializeApp', emptyMessage: 'Please select a player and start the analysis.' });
    
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
    return;
  }
  try {
    appState.isNavigating = true;
    // Use node id and move SAN for backend navigation
    const childNode = await sendMoveToBackend(move.san);
    if (childNode) {
      updateAppStateWithNode(childNode);
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
    // Use chess.js to calculate the new position
    // NOTE: For chess.js v1.4.0, we use the global Chess constructor with try/catch for exceptions
    const chess = new Chess(currentFen);
    
    // Check if the position is valid and get legal moves
    let moveResult = null;
    
    // Strategy 1: Try SAN notation (most reliable for chess players)
    if (move.san) {
      moveResult = chess.move(move.san);
    }
    
    // Strategy 2: Try UCI with explicit object notation
    if (!moveResult && move.uci && move.uci.length === 4) {
      const from = move.uci.substring(0, 2);
      const to = move.uci.substring(2, 4);
      moveResult = chess.move({ from: from, to: to });
    }
      // Strategy 3: Try plain UCI string (chess.js default parsing for v1.4.0)
    if (!moveResult && move.uci) {
      moveResult = chess.move(move.uci); // No sloppy parameter needed in v1.4.0
    }
    
    if (moveResult) {
      const newFen = chess.fen();
      return newFen;
    } else {
      console.error('❌ All move formats failed');
      return null;
    }
    
  } catch (error) {
    console.error('❌ Critical error in calculateNewPosition:', error);
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
    appState.currentNodeId = data.node_id || null;
    updatePositionUI(fen, data.moves);
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
 * Central function to render the move list in all modes.
 * @param {Array} moves - Array of move objects (with san, uci, id, color, etc.)
 * @param {Object} options - Optional context (e.g. { allowDelete, onDelete, mode, emptyMessage })
 */
function renderMoveList(moves, options = {}) {
  const movesList = document.getElementById('movesList');
  const logSource = options.logSource || 'unknown';
  if (!movesList) return;
  // Special modes (training, congratulations, etc.)
  if (options.mode === 'training') {
    movesList.innerHTML = `
      <div style="text-align: center; padding: 20px; color: #666;">
        <div style="font-size: 1.2rem; margin-bottom: 12px;">🎯 Trainingsmodus aktiv</div>
        <div style="font-size: 0.9rem; margin-bottom: 8px;">Spieler: ${appState.currentColor === 'white' ? 'Weiß' : 'Schwarz'}</div>
        <div style="font-size: 0.9rem; margin-bottom: 16px;">Status: ${appState.isOpponentTurn ? 'Gegner ist am Zug' : 'Du bist am Zug'}</div>
        <div style="background: #e8f5e8; padding: 8px; border-radius: 4px; font-size: 0.85rem;">
          💡 Tipp: Klicke auf die Figuren, um Züge zu machen!
        </div>
      </div>
    `;
    return;
  }
  if (options.mode === 'congratulations' && options.congratsMessage) {
    movesList.innerHTML = options.congratsMessage;
    return;
  }
  // Standard move list rendering
  if (!moves || moves.length === 0) {
    movesList.innerHTML = options.emptyMessage || '<p style="color: #666; font-style: italic;">No more moves available from this position.</p>';
    return;
  }
  const isOwnRepertoire = options.allowDelete !== undefined
    ? options.allowDelete
    : ['my repertoire', 'white_repertoir', 'black_repertoir'].includes((appState.currentPlayer || '').toLowerCase());
    const movesHtml = moves.map((move, index) => {
    const backendColor = move.color || '#888888';
    let logBadge = '';
    if (isOwnRepertoire && move.id) {
      logBadge = `<span style='font-size:0.7em;color:#888;margin-left:2px;'>(${logSource})</span>`;
    }
    return `
      <div class="move-item" data-move-index="${index}" data-log-id="moveitem-${logSource}-${index}" style="
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
          ${isOwnRepertoire && move.id ? `<button class=\"delete-move-btn\" data-node-id=\"${move.id}\" data-log-id=\"deletebtn-${logSource}-${index}\" title=\"Zug löschen\" style=\"margin-left:8px;background:none;border:none;color:#e74c3c;font-size:1.2rem;cursor:pointer;\">🗑️ ${logBadge}</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
  movesList.innerHTML = movesHtml;
  addMoveClickListeners();
  if (isOwnRepertoire) {
    document.querySelectorAll('.delete-move-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const nodeId = btn.getAttribute('data-node-id');
        const moveDiv = btn.closest('.move-item');
        let moveSan = '';
        if (moveDiv) {
          const moveTextDiv = moveDiv.querySelector('div');
          if (moveTextDiv) moveSan = moveTextDiv.textContent.trim();
        }
        if (!nodeId) return;
        if (!confirm(`Zug \"${moveSan}\" und alle Folgezüge wirklich löschen?`)) return;
        const res = await fetch('/api/delete_node', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ node_id: nodeId })
        });
        const data = await res.json();
        if (data.success) {
          showTrainingFeedback(`Zug \"${moveSan}\" gelöscht!`, 'success');
          await loadMovesForPosition(appState.currentPosition);
          renderChessBoard(appState.currentPosition, appState.currentColor);
          showAvailableMovesArrows(appState.availableMoves);
        } else {
          showTrainingFeedback('Fehler beim Löschen!', 'error');
        }
      };
    });
  }
}

/**
 * Update back button state (Schritt 3.4)
 */
function updateBackButton(enabled) {
  const backBtn = document.getElementById('backBtn');
  if (!backBtn) return;
  
  if (enabled) {
    backBtn.disabled = false;
    backBtn.style.background = '#6c757d';
    backBtn.style.color = '#fff';
    backBtn.style.cursor = 'pointer';
    backBtn.title = 'Go back to previous position';
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
 * Centralized function to update appState and UI from a backend node object
 */
function updateAppStateWithNode(node) {
  ensureChessgroundReady();
  if (!node) return;
  appState.currentNodeId = node.id;
  appState.currentNodeParentId = node.parent_id || null;
  if (node.games !== undefined) appState.games = node.games;
  if (node.win_rate !== undefined) appState.win_rate = node.win_rate;
  // Vereinheitlichter UI-Update-Aufruf
  const moves = node.children
    ? Object.entries(node.children).map(([uci, child]) => ({
        uci: uci,
        san: child.move_san,
        color: child.color,
        games: child.games,
        win_rate: child.win_rate,
        id: child.id
      }))
    : [];
  updatePositionUI(node.fen, moves);
  appState.currentArrows = moves;
  if (typeof window.updateLegalMovesFromBackend === 'function') window.updateLegalMovesFromBackend();
  updateBackButton(!!node.parent_id);
}

/**
 * Refactor back button logic to use node id and /api/get_node_by_id
 */
async function handleBackClick() {
  if (!appState.currentNodeId) {
    return;
  }
  const parentId = appState.currentNodeParentId;
  if (!parentId) {
    updateBackButton(false);
    clearHighlights(); // Only clear if not re-rendering
    return;
  }
  try {
    const response = await fetch('/api/get_node_by_id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: parentId })
    });
    const data = await response.json();
    if (data.success && data.node) {
      updateAppStateWithNode(data.node);
    } else {
      console.error('❌ [BACK] Error: Node not found or backend error', data);
      clearHighlights();
    }
  } catch (error) {
    clearHighlights();
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
    return false;
  }
    // Check if Chessground has processed the dimensions
  const cgBoundsFunc = window.cg.state.dom?.bounds;
  if (!cgBoundsFunc || typeof cgBoundsFunc !== 'function') {
    return false;
  }
  
  // BUG-FIX: Call the bounds function to get actual dimensions
  let cgBounds;
  try {
    cgBounds = cgBoundsFunc();
  } catch (error) {
    return false;
  }
  
  if (!cgBounds || cgBounds.width <= 0 || cgBounds.height <= 0) {
    return false;
  }
  
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
    setTimeout(() => addMoveArrow(fromSquare, toSquare, color, opacity), 100);
    return null;
  }
  
  // BUG-FIX: Check if Chessground board is ready before adding arrows
  if (!isBoardReady()) {
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
            event.target.closest('.toggle-switch').classList.toggle('active', isChecked);
        });
    }
  // --- END NEW ---

  // --- NEW: Add listeners for repertoire buttons ---
  const viewRepertoireBtn = document.getElementById('viewRepertoireBtn');
  if (viewRepertoireBtn) {
    viewRepertoireBtn.addEventListener('click', handleViewRepertoireClick);
    console.log('📋 View Repertoire button handler attached');
  }

  const trainRepertoireBtn = document.getElementById('trainRepertoireBtn');
  if (trainRepertoireBtn) {
    trainRepertoireBtn.addEventListener('click', handleTrainRepertoireClick);
    console.log('🎯 Train Repertoire button handler attached');
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
    // Check if in training mode first
    if (appState.trainingMode) {
      await handleTrainingMove(from, to);
      return;
    }
    
    // Robust repertoire check (case-insensitive, includes 'my repertoire')
    const repertoireNames = ['my repertoire', 'white_repertoir', 'black_repertoir'];
    const isOwnRepertoire = repertoireNames.includes((appState.currentPlayer || '').toLowerCase());
    if (isOwnRepertoire) {
      const Chess = window.game.constructor;
      const tempGame = new Chess(appState.currentPosition);
      const legalMoves = tempGame.moves({ verbose: true });
      const found = legalMoves.find(m => m.from === from && m.to === to);
      if (!found) {
        showMoveError(`Move ${from}→${to} is not legal in this position (Repertoire-Modus).`);
        renderChessBoard(appState.currentPosition, appState.currentColor);
        return;
      }
      // Check if move is already in the tree
      const moveInTree = appState.availableMoves.some(m => m.uci === from + to);
      if (!moveInTree) {
        // This is a new/temporary move - handled by sendMoveToBackend with save_switch_active
        console.log('🆕 New move detected - will be handled by sendMoveToBackend');
      }
      tempGame.move({ from, to });
      const newFen = tempGame.fen();
      const moveSan = found.san;
      // Always send the move to the backend, regardless of whether it is in the tree.
      const childNode = await sendMoveToBackend(moveSan);
      if (childNode) {
        updateAppStateWithNode(childNode);
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
      } else {
        showMoveError(`Move ${from}→${to} ist im Tree-Modus nicht erlaubt.`);
      }
    } catch (error) {
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
  }

  // Expose function globally for script-cg.js
  window.handleDragDropMove = handleDragDropMove;

  // Add keyboard navigation for back button and single-move forward
  document.addEventListener('keydown', function(event) {
    // Only trigger on left arrow, and not if a modal/input is focused
    if (event.key === 'ArrowLeft') {
      const backBtn = document.getElementById('backBtn');
      if (
        backBtn &&
        backBtn.offsetParent !== null && // visible
        !backBtn.disabled
      ) {
        // Optionally: avoid triggering if an input/textarea is focused
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
        event.preventDefault();
        handleBackClick();
      }
    }
    // NEU: ArrowRight für automatischen Zug, wenn nur ein legaler Zug vorhanden ist (nicht im Trainingsmodus)
    if (event.key === 'ArrowRight') {
      if (!appState.trainingMode && appState.availableMoves.length === 1) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
        event.preventDefault();
        // Simuliere Klick auf das einzige Move-Item
        const mockEvent = {
          currentTarget: {
            getAttribute: (attr) => attr === 'data-move-index' ? '0' : null
          }
        };
        handleMoveClick(mockEvent);
      }
    }
  });
}

/**
 * Show arrows for all available next moves (using Backend data!)
 * BUG-FIX: Batch arrow addition to prevent timing conflicts
 */
function showAvailableMovesArrows(moves, options = {}, caller = null) {
  // Central guard: No arrows in training mode unless force is true (e.g. for tip arrows)
  if (appState.trainingMode && !options.force) {
    clearArrows();
    return;
  }
  const boardElem = document.getElementById('board');
  if (!window.cg || !boardElem || boardElem.offsetWidth === 0 || boardElem.offsetHeight === 0) {
    console.warn('[WARN] Board or Chessground not ready for arrows');
    return;
  }
  const validMoves = (moves || []).filter(move => {
    if (!move || typeof move.uci !== 'string' || move.uci.length < 4) return false;
    const from = move.uci.substring(0, 2);
    const to = move.uci.substring(2, 4);
    const validSquare = sq => /^[a-h][1-8]$/.test(sq);
    return validSquare(from) && validSquare(to);
  });
  const shapes = validMoves.map(move => ({
    orig: move.uci.substring(0, 2),
    dest: move.uci.substring(2, 4),
    brush: 'repertoire',
    system: true
  }));
  requestAnimationFrame(() => {
    window.cg.setShapes(shapes);
    console.log(`[BOARD] showAvailableMovesArrows | Shapes: ${shapes.length}`);
  });
}

// 2. Brush "tip" für Tipp-Pfeile in Chessground-Konfiguration ergänzen
if (window.cg && window.cg.state && window.cg.state.drawable && window.cg.state.drawable.brushes) {
  window.cg.state.drawable.brushes.tip = { key: 'tip', color: '#ff9800', opacity: 1.0, lineWidth: 8 };
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
    console.warn('[WARN] Chessground not initialized');
    return;
  }
  const repertoireNames = ['my repertoire', 'white_repertoir', 'black_repertoir'];
  const isOwnRepertoire = repertoireNames.includes((appState.currentPlayer || '').toLowerCase());
  let dests = new Map();
  if (isOwnRepertoire) {
    const Chess = window.game.constructor;
    const chess = new Chess(appState.currentPosition);
    const legalMoves = chess.moves({ verbose: true });
    for (const move of legalMoves) {
      if (!dests.has(move.from)) dests.set(move.from, []);
      dests.get(move.from).push(move.to);
    }
  } else {
    for (const move of appState.availableMoves || []) {
      if (move.uci && move.uci.length >= 4) {
        const from = move.uci.substring(0, 2);
        const to = move.uci.substring(2, 4);
        if (!dests.has(from)) dests.set(from, []);
        dests.get(from).push(to);
      }
    }
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
  console.log('[BOARD] updateLegalMovesFromBackend | Moves:', dests.size);
  showAvailableMovesArrows(appState.availableMoves, {}, 'updateLegalMovesFromBackend');
};

/**
 * Check if a move exists in the current repertoire (without creating new nodes)
 */
async function checkMoveInRepertoire(moveSan) {
  try {
    const availableMoves = appState.availableMoves || [];
    
    // Check if the move exists in current available moves
    const moveExists = availableMoves.some(move => move.san === moveSan);
    
    if (moveExists) {
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.error('❌ Error checking move in repertoire:', error);
    return false;
  }
}

/**
 * Mark a node as studied and propagate learning status
 */
async function markNodeAsStudied(nodeId, sessionId) {
  try {
    const response = await fetch('/api/training/mark_studied', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        node_id: nodeId, 
        session_id: sessionId 
      })
    });
    
    const data = await response.json();
    if (data.success) {
      appState.studiedNodes.add(nodeId);
      return true;
    } else {
      console.error(`❌ Failed to mark node as studied:`, data.error);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error marking node as studied:', error);
    return false;
  }
}

/**
 * Get unstudied moves from current position
 */
async function getUnstudiedMoves(sessionId, positionFen) {
  try {
    const response = await fetch(`/api/training/get_unstudied_moves?session_id=${sessionId}&position_fen=${encodeURIComponent(positionFen)}`);
    const data = await response.json();
    
    if (data.success) {
      return data.moves;
    } else {
      console.error(`❌ Failed to get unstudied moves:`, data.error);
      return [];
    }
    
  } catch (error) {
    console.error('❌ Error getting unstudied moves:', error);
    return [];
  }
}

/**
 * Get learning progress for current session
 */
async function getLearningProgress(sessionId) {
  try {
    const response = await fetch(`/api/training/get_progress?session_id=${sessionId}`);
    const data = await response.json();
    
    if (data.success) {
      return data;
    } else {
      console.error(`❌ Failed to get learning progress:`, data.error);
      return null;
    }
    
  } catch (error) {
    console.error('❌ Error getting learning progress:', error);
    return null;
  }
}

/**
 * Return to start position and reset training state
 */
async function returnToStartPosition() {
  try {
    const response = await fetch(`/api/process_games/My Repertoire?color=${appState.currentColor}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error('Failed to reload start position');
    }
    appState.currentNodeId = data.node_id || null;
    // --- FIX: Set correct turn after reset in training mode ---
    if (appState.trainingMode) {
      if (appState.currentColor === 'black') {
        appState.isOpponentTurn = true;
        updatePositionUI(data.position, data.moves);
        setTimeout(() => playOpponentMove(), 500); // Let UI update, then play opponent
      } else {
        appState.isOpponentTurn = false;
        updatePositionUI(data.position, data.moves);
      }
    } else {
      appState.isOpponentTurn = false;
      updatePositionUI(data.position, data.moves);
    }
    await checkIfTrainingComplete();
    // ...
  } catch (error) {
    appState.currentNodeId = null;
    showTrainingFeedback('❌ Fehler beim Zurückkehren zur Startposition', 'error');
  }
}

/**
 * Show congratulations when all moves are learned
 */
async function showCongratulations() {
  try {
    console.log('Showing congratulations - all moves learned!');
    // Get final training statistics
    const learningProgress = await getLearningProgress(appState.trainingSessionId);
    const correctMoves = appState.trainingHistory.filter(h => h.correct).length;
    const incorrectMoves = appState.trainingHistory.filter(h => !h.correct).length;
    // Use correct moves as learned moves (more accurate)
    const learnedMoves = correctMoves;
    // Create congratulations message (ENGLISH, NO EMOJIS)
    const congratsMessage = `
      <div style="text-align: center; padding: 20px; color: #333;">
        <div style="font-size: 1.4rem; margin-bottom: 16px; color: #27ae60; font-weight: 700;">
          Congratulations!
        </div>
        <div style="font-size: 1.1rem; margin-bottom: 20px; color: #666;">
          You have learned all moves from your repertoire!
        </div>
        <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <div style="font-size: 1rem; margin-bottom: 8px; font-weight: 600; color: #333;">
            Training Progress:
          </div>
          <div style="font-size: 0.9rem; color: #666; margin-bottom: 4px;">
            Correct moves: ${correctMoves} | Mistakes: ${incorrectMoves}
          </div>
          <div style="font-size: 0.9rem; color: #27ae60; font-weight: 600;">
            Learned moves: ${learnedMoves}
          </div>
        </div>
        <div style="font-size: 0.9rem; color: #666;">
          You are ready for your next game!
        </div>
      </div>
    `;
    // Use central renderMoveList for congratulations
    renderMoveList([], { mode: 'congratulations', congratsMessage, logSource: 'showCongratulations' });
    // Show congratulations feedback (ENGLISH, NO EMOJIS)
    showTrainingFeedback('All moves learned! Congratulations!', 'success');
  } catch (error) {
    console.error('Error showing congratulations:', error);
  }
}

// Helper: Ensure node_id is set for the current position (fetch if missing)
async function ensureNodeIdForCurrentPosition() {
  if (appState.currentNodeId) return appState.currentNodeId;
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
    return appState.currentNodeId;
  } catch (e) {
    appState.currentNodeId = null;
    return null;
  }
}

// Defensive: Ensure Chessground is ready and event handlers are attached
function ensureChessgroundReady() {
  if (!window.cg || !document.getElementById('board')) {
    console.warn('[ensureChessgroundReady] Chessground missing, re-initializing...');
    const boardElem = document.getElementById('board');
    if (!boardElem) {
      console.error('[ensureChessgroundReady] Board element not found!');
      return;
  }
    // Remove any old board content
    boardElem.innerHTML = '';
    // Re-initialize Chessground
    window.cg = Chessground(boardElem, config);
    // Re-attach event handlers
    window.cg.set({ events: config.events });
    // <--- Immediately re-apply arrows after re-initialization
    if (appState.currentArrows && appState.currentArrows.length > 0) {
      showAvailableMovesArrows(appState.currentArrows);
    }
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
    return null;
  }
  
  // Check if save switch is active
  const saveSwitch = document.getElementById('saveToRepertoireSwitch');
  const saveSwitchActive = saveSwitch ? saveSwitch.checked : false;
  
  try {
    const response = await fetch('/api/get_child_node', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        node_id: appState.currentNodeId,
        move_san: moveSan,
        save_switch_active: saveSwitchActive
      })
    });
    const data = await response.json();
    if (data.success && data.child) {
      appState.currentNodeId = data.child.id;
      return data.child;
    }
    return null;
  } catch (e) {
    console.error('❌ Error sending move to backend:', e);
    return null;
  }
}

// ====================================================================
// 3. API LAYER (Server-Kommunikation)
// ====================================================================

async function getLearningStats(sessionId) {
  try {
    const response = await fetch(`/api/training/get_learning_stats?session_id=${sessionId}`);
    const data = await response.json();
    if (data.success) {
      appState.directlyLearnedNodes = new Set(data.directly_learned_node_ids || []);
      appState.mistakeCount = data.mistake_count || 0;
    }
    return data;
  } catch (e) {
    console.error('❌ Error fetching learning stats:', e);
    return null;
  }
}

async function markNodeAsDirectlyLearned(nodeId, sessionId) {
  const response = await fetch('/api/training/mark_directly_learned', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_id: nodeId, session_id: sessionId })
  });
  return await response.json();
}

async function unmarkNodeAsDirectlyLearned(nodeId, sessionId) {
  const response = await fetch('/api/training/unmark_directly_learned', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_id: nodeId, session_id: sessionId })
  });
  return await response.json();
}

async function recordMistake(sessionId) {
  const response = await fetch('/api/training/record_mistake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId })
  });
  return await response.json();
}

// ====================================================================
// 5. TRAINING LOGIC (Korrekte/Falsche Züge)
// ====================================================================

// Beispiel: Call this when a move is played correctly
async function handleCorrectMove(nodeId) {
  const result = await markNodeAsDirectlyLearned(nodeId, appState.trainingSessionId);
  if (result.success && result.newly_learned) {
    appState.directlyLearnedNodes.add(nodeId);
    updateLearningStatsDisplay();
  }
  // Wenn result.newly_learned === false: Kein Zähler-Inkrement!
}

// Beispiel: Call this when a move is played incorrectly
async function handleMistake(nodeId) {
  // Fehlerzähler immer erhöhen
  const result = await recordMistake(appState.trainingSessionId);
  if (result.success) {
    appState.mistakeCount = result.mistake_count;
    updateLearningStatsDisplay();
  }
  // Wenn Zug vorher direkt gelernt war, entlernen
  if (appState.directlyLearnedNodes.has(nodeId)) {
    const unmarkResult = await unmarkNodeAsDirectlyLearned(nodeId, appState.trainingSessionId);
    if (unmarkResult.success && unmarkResult.was_learned) {
      appState.directlyLearnedNodes.delete(nodeId);
      updateLearningStatsDisplay();
    }
  }
}

// ====================================================================
// 6. UI-Update für Lernstatistik
// ====================================================================
function updateLearningStatsDisplay() {
  const learned = appState.directlyLearnedNodes.size;
  const mistakes = appState.mistakeCount;
  const statsDiv = document.getElementById('learningStats');
  if (statsDiv) {
    statsDiv.innerHTML = `<strong>Gelernt:</strong> ${learned} &nbsp; <strong>Fehler:</strong> ${mistakes}`;
  }
}

// Zentrale UI-Update-Funktion für Positionswechsel
function updatePositionUI(fen, moves) {
  appState.currentPosition = fen;
  appState.availableMoves = moves || [];
  if (!appState.trainingMode) {
    renderMoveList(appState.availableMoves, { logSource: 'updatePositionUI' });
  }
  renderChessBoard(fen, appState.currentColor);
}

// Zentralisierte Hilfsfunktion zum Markieren als 'studied'
async function markCurrentNodeAsStudiedIfEndOfLine() {
  if (appState.currentNodeId && appState.trainingSessionId) {
    await markNodeAsStudied(appState.currentNodeId, appState.trainingSessionId);
  }
}

// 1. Zentrale Funktion zum Trainingsende-Check
async function checkIfTrainingComplete() {
  try {
    // NEU: Nur noch zentrale Backend-Logik nutzen
    if (appState.trainingMode && appState.currentPosition === CONFIG.DEFAULT_FEN) {
      // Backend-Endpoint abfragen
      const response = await fetch(`/api/training/root_children_studied?session_id=${encodeURIComponent(appState.trainingSessionId)}`);
      const data = await response.json();
      if (data.success && data.all_studied) {
        appState.trainingCompleted = true;
        showTrainingFeedback('All moves learned! Congratulations!', 'success');
        if (typeof showCongratulations === 'function') {
          setTimeout(() => showCongratulations(), 1000);
        }
        return true;
      }
      return false;
    }
    // Fallback: bisherige Logik für andere Fälle
    const progress = await getLearningProgress(appState.trainingSessionId);
    if (progress && progress.success && progress.progress) {
      const { studied_nodes, total_nodes } = progress.progress;
      if (studied_nodes >= total_nodes && total_nodes > 0) {
        appState.trainingCompleted = true;
        showTrainingFeedback('All moves learned! Congratulations!', 'success');
        if (typeof showCongratulations === 'function') {
          setTimeout(() => showCongratulations(), 1000);
        }
        return true;
      }
    } else {
      console.warn('⚠️ Could not get learning progress, falling back to starting position check');
      const unstudied = await getUnstudiedMoves(appState.trainingSessionId, CONFIG.DEFAULT_FEN);
      if (!unstudied || unstudied.length === 0) {
        appState.trainingCompleted = true;
        showTrainingFeedback('All moves learned! Congratulations!', 'success');
        if (typeof showCongratulations === 'function') {
          setTimeout(() => showCongratulations(), 1000);
        }
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('❌ Error checking training completion:', error);
    return false;
  }
}

// --- NEW CLEAN INITIALIZATION LOGIC ---

/**
 * Initialize all UI elements to their default state (dropdowns, buttons, etc.)
 */
function initializeUI() {
  // Example: Reset dropdowns, disable buttons, clear status messages
  const playerSelect = document.getElementById('playerSelect');
  if (playerSelect) playerSelect.selectedIndex = 0;
  setLoadingState(false);
  resetBoardUI();
  // Hide analysis/results sections if needed
  const resultsSection = document.getElementById('analysisResults');
  if (resultsSection) resultsSection.style.display = 'none';
}

/**
 * Set up the chessboard with a given FEN and orientation, no arrows or moves yet
 */
function setupBoard(fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', orientation = 'white') {
  if (typeof window.cg !== 'undefined') {
    window.cg.set({
      fen: fen,
      orientation: orientation,
      drawable: { ...window.cg.state.drawable, shapes: [] },
      movable: { ...window.cg.state.movable, dests: new Map() }
    });
  }
}

/**
 * Reset board, move list, and arrows to empty state
 */
function resetBoardUI() {
  clearHighlights();
  setupBoard(); // Default FEN, no arrows
  // Clear move list
  const movesList = document.getElementById('movesList');
  if (movesList) movesList.innerHTML = '';
  // Clear status
  const saveStatus = document.getElementById('saveStatus');
  if (saveStatus) saveStatus.textContent = '';
}

/**
 * Set loading state for the UI (disable/enable buttons, show/hide spinner)
 */
function setLoadingState(isLoading) {
  const analyzeBtn = document.getElementById('analyzeBtn');
  if (analyzeBtn) analyzeBtn.disabled = isLoading;
  const downloadPlayer = document.getElementById('downloadPlayer');
  if (downloadPlayer) downloadPlayer.disabled = isLoading;
  // Optionally show/hide a spinner or overlay
  // ...
}

// --- END NEW CLEAN INITIALIZATION LOGIC ---

/**
 * Fetch analysis data (FEN, moves, stats) for a player and color from the backend
 */
async function fetchAnalysis(player, color) {
  try {
    setLoadingState(true);
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player, color })
    });
    const data = await response.json();
    setLoadingState(false);
    return data;
  } catch (error) {
    setLoadingState(false);
    console.error('❌ Error fetching analysis:', error);
    return { success: false, error };
  }
}

/**
 * Apply analysis data: set state, render board, move list, and arrows in correct order
 */
function applyAnalysisData(data) {
  if (!data || !data.success) {
    // Show error in UI
    const saveStatus = document.getElementById('saveStatus');
    if (saveStatus) saveStatus.textContent = '❌ Error loading analysis data.';
    return;
  }
  // 1. Set state
  appState.currentPlayer = data.player;
  appState.currentColor = data.color;
  appState.currentPosition = data.position;
  appState.availableMoves = data.moves || [];

  // 2. Render board
  setupBoard(data.position, data.color);

  // 3. Set legal moves for Chessground
  if (typeof setLegalMoves === 'function') setLegalMoves(data.moves);

  // 4. Render move list (jetzt mit allowDelete für eigenes Repertoire)
  const isOwnRepertoire = ['my repertoire', 'white_repertoir', 'black_repertoir'].includes((data.player || '').toLowerCase());
  renderMoveList(data.moves, { allowDelete: isOwnRepertoire, logSource: "applyAnalysisData" });

  // 5. Draw arrows
  if (typeof drawArrows === 'function') drawArrows(data.moves);

  // Show analysis/results section
  const resultsSection = document.getElementById('analysisResults');
  if (resultsSection) resultsSection.style.display = 'block';
}

// --- Placeholders for setLegalMoves, renderMoveList, drawArrows ---
function setLegalMoves(moves) {
  if (typeof window.cg === 'undefined') return;
  let dests = new Map();
  (moves || []).forEach(move => {
    if (move.uci && move.uci.length >= 4) {
      const from = move.uci.substring(0, 2);
      const to = move.uci.substring(2, 4);
      if (!dests.has(from)) dests.set(from, []);
      dests.get(from).push(to);
    }
  });
  window.cg.set({
    movable: {
      ...window.cg.state.movable,
      dests: dests,
      color: 'both',
      free: false,
      showDests: true
    }
  });
}

function drawArrows(moves) {
  if (typeof window.cg === 'undefined') return;
  const shapes = [];
  (moves || []).forEach(move => {
    const from = move.uci ? move.uci.substring(0, 2) : null;
    const to = move.uci ? move.uci.substring(2, 4) : null;
    if (!from || !to || !isValidSquare(from) || !isValidSquare(to)) return;
    shapes.push({ orig: from, dest: to, brush: 'repertoire', system: true });
  });
  window.cg.setShapes(shapes);
}

/**
 * Recovery function to reset training state when stuck
 */
function resetTrainingState() {
  console.log('🔄 Resetting training state (full reload)...');
  // Clear any pending timeouts
  if (window.trainingTimeout) {
    clearTimeout(window.trainingTimeout);
    window.trainingTimeout = null;
  }
  // Restart training mode with current color (reloads tree, resets all state)
  startTrainingMode(appState.currentColor);
  showTrainingFeedback('Training fully reset - new session started', 'info');
}

/**
 * Add manual reset button to training UI
 */
function addTrainingResetButton() {
  // Remove existing reset button if present
  const existingBtn = document.getElementById('resetTrainingBtn');
  if (existingBtn) {
    existingBtn.remove();
  }
  
  // Create new reset button
  const resetBtn = document.createElement('button');
  resetBtn.id = 'resetTrainingBtn';
  resetBtn.textContent = '🔄 Reset Training';
  resetBtn.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: #f39c12;
    color: white;
    border: none;
    padding: 12px 20px;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(243, 156, 18, 0.3);
  `;
  resetBtn.addEventListener('click', resetTrainingState);
  document.body.appendChild(resetBtn);
}

/**
 * Remove training reset button
 */
function removeTrainingResetButton() {
  const resetBtn = document.getElementById('resetTrainingBtn');
  if (resetBtn) {
    resetBtn.remove();
  }
}