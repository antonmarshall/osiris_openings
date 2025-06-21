// Import both libraries as ESM from jsDelivr (proven working URLs)
import { Chessground } from 'https://cdn.jsdelivr.net/npm/chessground@9.2.1/dist/chessground.js';
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';

// Wait for DOM ready, then initialize
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Chess.js game logic
  const game = new Chess();
  
  // Annotation store placeholder
  const annotationStore = new Map();

  // ====================================================================
  // CALLBACK FUNCTIONS (defined first)
  // ====================================================================

  /**
   * Callback when user selects a piece (click-to-move)
   * @param {string} square - selected square (e.g., 'e2')
   */  function onSelect(square) {
    console.log(`🎯 PIECE SELECTED: ${square}`);
    console.log(`🔍 Current arrows on board:`, window.cg?.state?.drawable?.shapes?.length || 0);
    
    // Check if this piece has legal moves
    if (typeof window.appState !== 'undefined' && window.appState.availableMoves) {
      const availableFromSquares = new Set();
      window.appState.availableMoves.forEach(move => {
        if (move.uci && move.uci.length >= 4) {
          availableFromSquares.add(move.uci.substring(0, 2));
        }
      });
      
      if (availableFromSquares.has(square)) {
        console.log(`✅ Piece at ${square} has legal moves`);
      } else {
        console.log(`⚠️ Piece at ${square} has no legal moves`);
      }
    } else {
      console.log(`⚠️ appState or availableMoves not available for legal move check`);    }
  }

  /**
   * Callback after a valid move on the board
   * CLICK-TO-MOVE: Handle piece selection and move execution
   * @param {string} from - source square
   * @param {string} to - destination square
   */
  function onMove(from, to) {
    console.log(`🖱️ CLICK-TO-MOVE: User moved ${from} → ${to}`);
    
    // BACKEND-FOKUSSIERT: Use existing move handling system
    if (typeof window.handleDragDropMove === 'function') {
      // Note: handleDragDropMove is actually generic move handler - works for both drag&drop and click
      window.handleDragDropMove(from, to);
    } else {
      console.warn('⚠️ handleDragDropMove not available, falling back to Chess.js validation');
      
      // FALLBACK: Legacy Chess.js validation (should be removed later)
      const result = game.move({ from, to });
      if (!result) {
        // Invalid move: reset position and return
        cg.set({ fen: game.fen(), movable: { free: false, color: config.movable.color } });
        console.log('❌ Invalid move rejected by Chess.js');
        return;
      }
      
      // Update board position and highlight
      cg.set({ fen: game.fen(), lastMove: [from, to] });
      console.log('✅ Move validated by Chess.js (fallback mode)');
    }
  }

  /**
   * Callback when user draws an annotation shape
   * @param {object} shape - annotation shape data
   */
  function onDraw(shape) {
    annotationStore.set(shape.id, shape);
  }

  /**
   * Callback when user erases an annotation shape
   * @param {object} shape - annotation shape data
   */
  function onErase(shape) {
    annotationStore.delete(shape.id);
  }

  // ====================================================================
  // CHESSGROUND CONFIGURATION
  // ====================================================================

  // Central configuration for Chessground board
  const config = {
    draggable: {
      enabled: true,       // Core setting to enable dragging system for animations
      showGhost: false     // Do not show a 'ghost' piece during animations
    },
    orientation: 'white',       // Default: white on bottom
    viewOnly: false,
    disableContextMenu: true,
    animation: {
      enabled: true,
      duration: 200 // Use a subtle animation duration
    },
    highlight: {
      lastMove: true,
      check: true,
      legalMoves: true
    },
    movable: {
      free: false,
      color: 'both',            // Who can move: white, black, both
      showDests: true,          // ✅ ENABLE: Show legal move destinations (green dots)
      dests: new Map()          // Will be populated with backend legal moves
    },
    selectable: {
      enabled: true             // ✅ CRITICAL: Enable piece selection for click-to-move
    },
    events: {
      select: onSelect,         // When user selects a piece
      move: onMove              // When user completes a move (click-to-move)
    },    drawable: {
      enabled: true,
      visible: true,
      eraseOnClick: false,      // Keep arrows visible when clicking pieces
      shapes: [],               // Arrows/circles initial empty
      brushes: {
        // Custom brushes for backend color system
        excellent: { key: 'excellent', color: '#4caf50', opacity: 1.0, lineWidth: 6 },    // 65%+ win rate
        good: { key: 'good', color: '#8bc34a', opacity: 1.0, lineWidth: 6 },              // 55-64% win rate  
        average: { key: 'average', color: '#ffeb3b', opacity: 1.0, lineWidth: 6 },        // 45-54% win rate
        below: { key: 'below', color: '#ff9800', opacity: 1.0, lineWidth: 6 },            // 35-44% win rate
        poor: { key: 'poor', color: '#f44336', opacity: 1.0, lineWidth: 6 },              // Below 35% win rate
        nodata: { key: 'nodata', color: '#9e9e9e', opacity: 1.0, lineWidth: 4 },         // No statistical data
        repertoire: { key: 'repertoire', color: '#4caf50', opacity: 1.0, lineWidth: 8 }  // Repertoire moves
      },
      events: {
        draw: onDraw,           // Callback when user draws
        erase: onErase          // Callback when user erases
      }
    }
  };

  // Instantiate Chessground using global from UMD
  const cg = Chessground(document.getElementById('board'), config);

  console.log('✅ Chessground board initialized with Chess.js v1.4.0 - Click-to-Move Mode');

  // ====================================================================
  // UTILITY FUNCTIONS
  // ====================================================================

  /**
   * Update Chessground legal moves from backend data
   * BACKEND-INTEGRATION: Convert backend moves to Chessground dests format
   */  function updateLegalMovesFromBackend() {
    if (typeof window.appState === 'undefined' || !window.appState.availableMoves) {
      console.log('📍 No backend moves available for legal move display');
      return;
    }
    
    const dests = new Map();
    
    // Convert backend moves to Chessground dests format
    window.appState.availableMoves.forEach(move => {
      if (move.uci && move.uci.length >= 4) {
        const from = move.uci.substring(0, 2);
        const to = move.uci.substring(2, 4);
        
        if (!dests.has(from)) {
          dests.set(from, []);
        }
        dests.get(from).push(to);
      }
    });
    
    // Update Chessground with backend legal moves
    cg.set({ 
      movable: { 
        dests: dests,
        color: 'both',
        showDests: true
      } 
    });
    
    console.log(`✅ Updated legal moves: ${dests.size} pieces with legal moves`);
  }

  /**
   * Reset board to initial position
   */
  function resetBoard() {
    game.reset();
    cg.set({ fen: game.fen(), orientation: 'white' });
  }

  /**
   * Flip board orientation
   */
  function flipBoard() {
    cg.toggleOrientation();
  }

  /**
   * Map backend color to Chessground brush name
   * @param {string} backendColor - Hex color from backend (e.g., '#4caf50')
   * @param {boolean} isRepertoire - Whether this is a repertoire move
   * @returns {string} - Chessground brush name
   */  function getChessgroundBrush(backendColor, isRepertoire = false) {
    if (isRepertoire) {
      return 'repertoire';
    }
    
    // Map backend colors to brush names
    const colorToBrush = {
      '#4caf50': 'excellent',  // Green - 65%+ win rate
      '#8bc34a': 'good',       // Light green - 55-64% win rate
      '#ffeb3b': 'average',    // Yellow - 45-54% win rate
      '#ff9800': 'below',      // Orange - 35-44% win rate
      '#f44336': 'poor',       // Red - Below 35% win rate
      '#9e9e9e': 'nodata'      // Gray - No statistical data
    };
      const result = colorToBrush[backendColor] || 'nodata';
    
    return result;
  }

  // ====================================================================
  // GLOBAL EXPORTS
  // ====================================================================  // Expose functions globally for HTML button handlers
  window.resetBoard = resetBoard;
  window.flipBoard = flipBoard;
  window.updateLegalMovesFromBackend = updateLegalMovesFromBackend;
  window.getChessgroundBrush = getChessgroundBrush;

  // Handle window resize to redraw board responsively
  window.addEventListener('resize', () => {
    cg.redrawAll(); // Chessground v9.x API method
  });

  // Expose game and cg globally if needed
  window.cg = cg;
  window.game = game;

}); // End DOMContentLoaded
