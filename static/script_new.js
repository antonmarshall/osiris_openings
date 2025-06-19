// HORUS Openings - Clean Frontend Logic
// =====================================
// Simplified JavaScript for the new card-based design

(function() {
  'use strict';

  // ====================================================================
  // Global State
  // ====================================================================
  let board = null;
  let game = null;
  let currentPlayer = null;
  let currentColor = 'white';

  // ====================================================================
  // Utility Functions
  // ====================================================================
  function showStatus(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.className = `status-message status-${type}`;
    element.textContent = message;
    element.style.display = 'block';
    
    // Auto-hide after 5 seconds for success messages
    if (type === 'success') {
      setTimeout(() => {
        element.style.display = 'none';
      }, 5000);
    }
  }

  function hideStatus(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      element.style.display = 'none';
    }
  }

  // ====================================================================
  // API Functions
  // ====================================================================
  async function loadPlayers() {
    try {
      const response = await fetch('/api/players');
      const data = await response.json();
      
      const select = document.getElementById('playerSelect');
      select.innerHTML = '<option value="">Spieler auswählen...</option>';
      
      if (data.success && data.players.length > 0) {
        data.players.forEach(player => {
          const option = document.createElement('option');
          option.value = player;
          option.textContent = player.replace(/_/g, ' ');
          select.appendChild(option);
        });
      } else {
        select.innerHTML = '<option value="">Keine Spieler gefunden</option>';
      }
    } catch (error) {
      console.error('Error loading players:', error);
      showStatus('analyzeStatus', 'Fehler beim Laden der Spieler', 'error');
    }
  }

  async function startAnalysis(player, color) {
    try {
      showStatus('analyzeStatus', 'Initialisiere Analyse...', 'info');
      
      const response = await fetch('/api/get_initial_position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: player, color: color })
      });
      
      const data = await response.json();
      
      if (data.success) {
        currentPlayer = player;
        currentColor = color;
        
        // Initialize the chess board
        initializeBoard();
        
        // Load initial moves
        await loadMovesForPosition(data.position);
        
        // Show game area
        document.getElementById('gameArea').classList.add('active');
        
        showStatus('analyzeStatus', `Analyse gestartet für ${player}`, 'success');
        
        // Scroll to game area
        document.getElementById('gameArea').scrollIntoView({ behavior: 'smooth' });
      } else {
        throw new Error(data.error || 'Unbekannter Fehler');
      }
    } catch (error) {
      console.error('Error starting analysis:', error);
      showStatus('analyzeStatus', `Fehler: ${error.message}`, 'error');
    }
  }

  async function downloadPlayer(playerName, gameLimit) {
    try {
      showStatus('downloadStatus', 'Download wird gestartet...', 'info');
      
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          player_name: playerName, 
          max_games: parseInt(gameLimit) 
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        showStatus('downloadStatus', `Download für ${playerName} gestartet (Task ID: ${data.task_id})`, 'success');
        
        // Refresh player list after successful download
        setTimeout(() => {
          loadPlayers();
        }, 2000);
        
        // Clear form
        document.getElementById('newPlayerName').value = '';
        document.getElementById('downloadLimit').value = '200';
      } else {
        throw new Error(data.error || 'Download fehlgeschlagen');
      }
    } catch (error) {
      console.error('Error downloading player:', error);
      showStatus('downloadStatus', `Fehler: ${error.message}`, 'error');
    }
  }

  async function loadMovesForPosition(fen) {
    try {
      const response = await fetch('/api/find_moves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fen: fen, 
          player_name: currentPlayer, 
          color: currentColor 
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        displayMoves(data.moves);
      } else {
        document.getElementById('movesContainer').innerHTML = 
          '<p style="color: #e53e3e;">Fehler beim Laden der Züge</p>';
      }
    } catch (error) {
      console.error('Error loading moves:', error);
      document.getElementById('movesContainer').innerHTML = 
        '<p style="color: #e53e3e;">Netzwerkfehler beim Laden der Züge</p>';
    }
  }

  // ====================================================================
  // Chess Board Functions
  // ====================================================================
  function initializeBoard() {
    // Initialize chess.js game
    game = new Chess();
    
    // Initialize chessboard.js
    const config = {
      draggable: false,
      position: 'start',
      pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
      orientation: currentColor
    };
    
    board = Chessboard('board', config);
    
    // Ensure proper sizing
    board.resize();
  }

  function makeMove(moveUci) {
    try {
      // Make move in chess.js
      const move = game.move(moveUci, { sloppy: true });
      if (!move) {
        console.error('Invalid move:', moveUci);
        return;
      }
      
      // Update board position
      board.position(game.fen());
      
      // Load new moves for this position
      loadMovesForPosition(game.fen());
      
    } catch (error) {
      console.error('Error making move:', error);
    }
  }

  function resetBoard() {
    if (game && board) {
      game.reset();
      board.position('start');
      loadMovesForPosition(game.fen());
    }
  }

  // ====================================================================
  // Move Display Functions
  // ====================================================================
  function displayMoves(moves) {
    const container = document.getElementById('movesContainer');
    
    if (!moves || moves.length === 0) {
      container.innerHTML = '<p style="color: #64748b;">Keine Züge verfügbar für diese Position</p>';
      return;
    }
    
    let html = '<div style="display: grid; gap: 8px;">';
    
    moves.forEach((move, index) => {
      const winRate = move.win_rate || 0;
      const games = move.games || 0;
      const percentage = Math.round(winRate);
      
      // Color coding for win rates
      let barColor = '#e2e8f0';
      if (percentage >= 60) barColor = '#68d391';
      else if (percentage >= 50) barColor = '#fbb042';
      else if (percentage >= 40) barColor = '#fc8181';
      
      html += `
        <div class="move-item" onclick="makeMove('${move.uci}')" style="
          padding: 12px;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        " onmouseover="this.style.backgroundColor='#f7fafc'" onmouseout="this.style.backgroundColor='white'">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="font-size: 1rem;">${move.san}</strong>
              <div style="font-size: 0.8rem; color: #64748b; margin-top: 2px;">
                ${games} Spiele • ${percentage}% Erfolg
              </div>
            </div>
            <div style="width: 40px; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
              <div style="
                width: ${percentage}%;
                height: 100%;
                background: ${barColor};
                transition: width 0.3s ease;
              "></div>
            </div>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    container.innerHTML = html;
  }

  // ====================================================================
  // Event Handlers
  // ====================================================================
  function setupEventHandlers() {
    // Analyze button
    document.getElementById('analyzeBtn').addEventListener('click', () => {
      const player = document.getElementById('playerSelect').value;
      const color = document.querySelector('input[name="colorSelect"]:checked').value;
      
      if (!player) {
        showStatus('analyzeStatus', 'Bitte wähle einen Spieler aus', 'error');
        return;
      }
      
      hideStatus('analyzeStatus');
      startAnalysis(player, color);
    });
    
    // Download button
    document.getElementById('downloadPlayer').addEventListener('click', () => {
      const playerName = document.getElementById('newPlayerName').value.trim();
      const gameLimit = document.getElementById('downloadLimit').value;
      
      if (!playerName) {
        showStatus('downloadStatus', 'Bitte gib einen Spielernamen ein', 'error');
        return;
      }
      
      if (!gameLimit || gameLimit < 10 || gameLimit > 1000) {
        showStatus('downloadStatus', 'Anzahl Spiele muss zwischen 10 und 1000 liegen', 'error');
        return;
      }
      
      hideStatus('downloadStatus');
      downloadPlayer(playerName, gameLimit);
    });
    
    // Reset button
    document.getElementById('resetBtn').addEventListener('click', resetBoard);
    
    // Enter key in player name input
    document.getElementById('newPlayerName').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('downloadPlayer').click();
      }
    });
  }

  // ====================================================================
  // Initialization
  // ====================================================================
  function initialize() {
    console.log('🏛️ HORUS Openings - Initializing...');
    
    // Setup event handlers
    setupEventHandlers();
    
    // Load initial data
    loadPlayers();
    
    console.log('✅ HORUS Openings - Ready!');
  }

  // ====================================================================
  // Window Functions (Global Scope)
  // ====================================================================
  window.makeMove = makeMove;
  window.resetBoard = resetBoard;

  // ====================================================================
  // Start App
  // ====================================================================
  $(document).ready(initialize);

})();
