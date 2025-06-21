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
  isNavigating: false        // Flag für Navigation-State
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
  
  // Show arrows for available moves (initial display)
  showAvailableMovesArrows(data.moves || []);
  
  // Then update Chessground legal moves (AFTER appState is updated)
  if (typeof window.updateLegalMovesFromBackend === 'function') {
    window.updateLegalMovesFromBackend();
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
      // Set board orientation based on player color
      const orientation = getBoardOrientation(playerColor);
      
      // ✅ CRITICAL FIX: Preserve existing movable configuration when updating FEN
      const currentMovable = window.cg.state.movable;
      
      // Update the Chessground board while preserving legal moves
      window.cg.set({
        fen: fen,
        orientation: orientation,
        movable: currentMovable  // ✅ Preserve legal moves (dests) and other movable settings
      });
        console.log('✅ Board rendered successfully with Chessground, orientation:', orientation);
      console.log('✅ Legal moves preserved:', currentMovable?.dests?.size || 0, 'pieces');
      
      // ✅ DEBUG: Log legal moves after board update
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
    window.cg.set({ 
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      movable: currentMovable  // Preserve legal moves
    });
    console.log('🧹 Chessboard cleared to starting position');
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
    // Set navigation flag
    appState.isNavigating = true;
    
    // Save current state to history
    const currentState = {
      fen: appState.currentPosition,
      moves: [...appState.availableMoves],
      stats: {
        games: document.getElementById('statsContent')?.textContent || '',
        position: appState.currentPosition
      }
    };
    appState.moveHistory.push(currentState);
      // Calculate new position after move (PHASE 1: Simplified)
    const newFen = await calculateNewPositionSimple(appState.currentPosition, move);
    
    if (newFen) {
      // Update board visually
      renderChessBoard(newFen, appState.currentColor);
      
      // Highlight the move (from/to squares)
      highlightPlayedMove(move);
      
      // Load new moves for the new position
      await loadMovesForPosition(newFen);
      
      // Enable back button
      updateBackButton(true);
      
      console.log('✅ Move navigation completed');
    } else {
      console.error('❌ Could not calculate new position');
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
    console.log('📡 Loading moves for new position...');
    
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
    
    const data = await response.json();    if (data.success) {
      // Update app state
      appState.currentPosition = fen;
      appState.availableMoves = data.moves || [];
      
      // Update UI
      updatePositionStats(data.stats);
      updateMovesList(data.moves || []);
      
      // Show arrows for available next moves
      showAvailableMovesArrows(data.moves || []);
      
      // ✅ NEW: Update Chessground legal moves for click-to-move
      if (typeof window.updateLegalMovesFromBackend === 'function') {
        window.updateLegalMovesFromBackend();
      }
      
      console.log('✅ Loaded', data.moves?.length || 0, 'moves for new position');
    } else {
      console.error('❌ Failed to load moves:', data.error);
    }
    
  } catch (error) {
    console.error('❌ Error loading moves for position:', error);
  }
}

/**
 * Highlight the move that was just played (Schritt 3.5 - nur Squares, keine Pfeile)
 */
function highlightPlayedMove(move) {
  // Clear previous highlights and arrows
  clearHighlights();
  clearArrows(); // Entferne alle Pfeile
  
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
  
  console.log('⬅️ Going back to previous position...');
  
  try {
    // Get previous state
    const previousState = appState.moveHistory.pop();
    
    // Update app state
    appState.currentPosition = previousState.fen;
    appState.availableMoves = previousState.moves;
      // Update board
    renderChessBoard(previousState.fen, appState.currentColor);
    
    // Clear move highlights and arrows
    clearHighlights();
    clearArrows();
    
    // Update moves list
    updateMovesList(previousState.moves);
    
    // Update position info
    const positionInfo = document.getElementById('positionInfo');
    if (positionInfo) {
      positionInfo.innerHTML = `
        <strong>Player:</strong> ${appState.currentPlayer} (${appState.currentColor}) | 
        <strong>Position:</strong> ${previousState.fen.substring(0, 30)}...
      `;
    }
    
    // Update back button state
    updateBackButton(appState.moveHistory.length > 0);
    
    console.log('✅ Successfully went back to previous position');
    
  } catch (error) {
    console.error('❌ Error going back:', error);
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
    san = san.replace(/0-0/g, 'O-O');      // Convert 0-0 to O-O (do this after the above)
    
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
  
  const currentOrientation = window.cg.state.orientation;
  const newOrientation = currentOrientation === 'white' ? 'black' : 'white';
  
  console.log(`🔄 Flipping board from ${currentOrientation} to ${newOrientation}`);
  window.cg.set({ orientation: newOrientation });
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
    window.cg.setShapes([]);
    console.log('🧹 Cleared all arrows with Chessground');
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
    
    try {
      // ARCHITECTURE: Find move in Backend-provided available moves
      const uciMove = from + to;
      const matchingMove = appState.availableMoves.find(move => 
        move.uci === uciMove || 
        (move.uci && move.uci.startsWith(uciMove)) || // Handle promotion moves
        isEquivalentMove(from, to, move)
      );
      
      if (!matchingMove) {
        console.warn(`⚠️ Move ${from}→${to} not found in Backend moves`);
        console.log('Available moves:', appState.availableMoves.map(m => m.uci));
        
        // ENHANCEMENT: Reset board to current position (reject invalid move)
        renderChessBoard(appState.currentPosition, appState.currentColor);
        
        // TODO-UX: Show user feedback about invalid move
        showMoveError(`Move ${from}→${to} is not available in current position`);
        return;
      }
        console.log(`✅ CLICK-TO-MOVE: Valid move found:`, matchingMove);
      
      // BACKEND-FOKUSSIERT: Use existing handleMoveClick logic
      const moveIndex = appState.availableMoves.indexOf(matchingMove);
      const mockEvent = {
        currentTarget: {
          getAttribute: (attr) => attr === 'data-move-index' ? moveIndex.toString() : null
        }
      };
      
      // Delegate to existing navigation system
      await handleMoveClick(mockEvent);
      
      console.log(`🖱️ CLICK-TO-MOVE: Move successfully processed via navigation system`);
        } catch (error) {
      console.error('❌ Error processing click-to-move:', error);
      
      // ENHANCEMENT: Reset board on error
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
  // Clear existing arrows first
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
        brush: brushName
      });
      
      console.log(`🏹 Arrow ${index + 1}: ${fromSquare}→${toSquare} | Backend Color: ${backendColor} | Brush: ${brushName} | Games: ${move.games} | Win%: ${move.win_rate?.toFixed(1)}%`);
    }
  });
  
  // BUG-FIX: Add all arrows in one batch operation
  try {
    window.cg.setShapes([...currentShapes, ...newArrows]);
    console.log(`✅ All ${newArrows.length} available move arrows displayed with backend intelligence`);
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
      console.log(`❌ ${notation} failed:`, error.message);
    }
  });
  
  console.log('🧪 Chess.js castling test completed!');
};

/**
 * PHASE 1 FIX: Simplified move calculation using available Chess.js
 */
async function calculateNewPositionSimple(currentFen, move) {
  try {
    console.log('🔍 Simple move calculation for:', move.san || move.uci);
    
    // Import Chess from script-cg.js global
    if (typeof window.game !== 'undefined' && window.game.constructor) {
      const Chess = window.game.constructor;
      const tempGame = new Chess(currentFen);
      
      // Handle castling moves specially
      if (move.uci === 'e1g1' || move.uci === 'e1c1' || move.uci === 'e8g8' || move.uci === 'e8c8') {
        try {
          // Try the UCI move directly for castling
          const result = tempGame.move(move.uci);
          if (result) {
            console.log('✅ Castling move successful:', result.san);
            return tempGame.fen();
          }
        } catch (e) {
          // If UCI fails, try standard castling notation
          const castlingMap = {
            'e1g1': 'O-O',    // White kingside
            'e1c1': 'O-O-O',  // White queenside  
            'e8g8': 'O-O',    // Black kingside
            'e8c8': 'O-O-O'   // Black queenside
          };
          try {
            const result = tempGame.move(castlingMap[move.uci]);
            if (result) {
              console.log('✅ Castling move successful:', result.san);
              return tempGame.fen();
            }          } catch (e2) {
            console.log('⚠️ Castling failed both ways:', move.uci, e.message, e2.message);
          }
        }
      }
      
      // Try SAN first, then UCI object, then UCI string
      const moveVariants = [
        move.san,
        move.uci && move.uci.length === 4 ? { from: move.uci.slice(0,2), to: move.uci.slice(2,4) } : null,
        move.uci
      ].filter(Boolean);
      
      for (const variant of moveVariants) {
        try {
          const result = tempGame.move(variant);
          if (result) {
            console.log('✅ Move successful:', result.san);
            return tempGame.fen();
          }        } catch (e) {
          console.log('⚠️ Move variant failed:', variant, e.message);
        }
      }
    }
    
    console.error('❌ All move variants failed for:', move);
    return null;
  } catch (error) {
    console.error('❌ Critical error in move calculation:', error);
    return null;
  }
}

// ====================================================================
// ARROW TIMING DIAGNOSTICS (for debugging NaN coordinate issues)
// ====================================================================

/**
 * Comprehensive arrow timing diagnostic
 * TODO-TESTING: Remove this after arrow issues are resolved
 */
window.testArrowTiming = function() {
  console.log('🧪 ARROW TIMING TEST: Starting diagnostic...');
  
  // Test 1: Board dimensions
  const boardElement = document.getElementById('board');
  const rect = boardElement?.getBoundingClientRect();
  console.log('🧪 Board DOM dimensions:', rect);
    // Test 2: Chessground state
  console.log('🧪 Chessground available:', !!window.cg);
  console.log('🧪 Chessground state:', window.cg?.state);
  console.log('🧪 Chessground bounds function:', window.cg?.state?.dom?.bounds);
  
  // BUG-FIX: Call bounds function to get actual dimensions
  let cgBounds = null;
  try {
    if (window.cg?.state?.dom?.bounds && typeof window.cg.state.dom.bounds === 'function') {
      cgBounds = window.cg.state.dom.bounds();
    }
  } catch (error) {
    console.log('🧪 Error getting bounds:', error);
  }
  console.log('🧪 Chessground actual bounds:', cgBounds);
  
  // Test 3: Board readiness
  console.log('🧪 Board ready check:', isBoardReady());
  
  // Test 4: Manual arrow test
  if (isBoardReady()) {
    console.log('🧪 Testing manual arrow: e2->e4');
    addMoveArrow('e2', 'e4', '#ff0000', 0.8);
  } else {
    console.log('🧪 Board not ready for manual arrow test');
  }
  
  console.log('🧪 ARROW TIMING TEST: Complete');
};

// Auto-run timing test after 2 seconds
setTimeout(() => {
  if (window.testArrowTiming && typeof window.testArrowTiming === 'function') {
    window.testArrowTiming();
  }
}, 2000);

// ====================================================================
// DRAG & DROP ERROR SCENARIOS & HANDLING
// ====================================================================

/**
 * Comprehensive error handling for drag & drop moves
 * TODO-TESTING: Document all possible error scenarios
 */
window.debugDragDropErrors = function() {
  console.log('🧪 DRAG & DROP ERROR SCENARIOS:');
  console.log('1. Move not in Backend moves → Board reset');
  console.log('2. Network error during navigation → Fallback to current position');
  console.log('3. State desync → Force position reload');
  console.log('4. Invalid squares → Input validation');
  console.log('5. Board not ready → Delay and retry');
  console.log('Available moves:', appState.availableMoves?.length || 0);
  console.log('Current position:', appState.currentPosition);
  console.log('Current player:', appState.currentPlayer);
};

/**
 * Force board state synchronization with Backend
 * ENHANCEMENT: Recovery mechanism for state desync
 */
async function forceBoardStateSync() {
  console.log('🔄 FORCE SYNC: Synchronizing board state with Backend...');
  
  try {
    // Reload moves for current position
    await loadMovesForPosition(appState.currentPosition);
    
    // Ensure board shows correct position
    renderChessBoard(appState.currentPosition, appState.currentColor);
    
    console.log('✅ FORCE SYNC: Board state synchronized');
  } catch (error) {
    console.error('❌ FORCE SYNC: Failed to synchronize board state:', error);
  }
}

// Expose debugging functions
window.forceBoardStateSync = forceBoardStateSync;

// ✅ DEBUGGING: Add console logging for click-to-move testing
window.debugClickToMove = function() {
  console.log('🔍 CLICK-TO-MOVE DEBUG INFO:');
  console.log('1. Chessground config:');
  console.log('   - draggable:', window.cg?.state?.draggable);
  console.log('   - showDests:', window.cg?.state?.movable?.showDests);
  console.log('   - dests size:', window.cg?.state?.movable?.dests?.size || 0);
  console.log('   - selectable.enabled:', window.cg?.state?.selectable?.enabled);
  console.log('   - selected piece:', window.cg?.state?.selected);
  console.log('2. Available moves:', appState.availableMoves?.length || 0);
  console.log('3. Current position:', appState.currentPosition);
  console.log('4. Legal move dests:', window.cg?.state?.movable?.dests);
  
  if (window.cg?.state?.movable?.dests) {
    console.log('5. Legal moves by piece:');
    for (const [from, tos] of window.cg.state.movable.dests) {
      console.log(`   ${from} → [${tos.join(', ')}]`);
    }
  }
  
  console.log('6. Event handlers:');
  console.log('   - onSelect function exists:', typeof onSelect !== 'undefined');
  console.log('   - onMove function exists:', typeof onMove !== 'undefined');
};

// ...existing code...