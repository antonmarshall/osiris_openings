// Chess.com Style Move Stats Test
class ChessComMoveStatsTest {
  static createMoveButton(move) {
    // Container erstellen
    const container = this.createChessComContainer(move);
    
    // Komponenten erstellen
    const moveInfo = this.createMoveInfo(move);
    const statsBar = this.createChessComBar(move);
    const winrateDisplay = this.createWinrateDisplay(move);
    const eloDisplay = this.createCompactEloDisplay(move);
    
    // Zusammenbauen
    container.appendChild(moveInfo);
    container.appendChild(statsBar);
    container.appendChild(winrateDisplay);
    container.appendChild(eloDisplay);
    
    // Events & Accessibility
    this.addChessComEvents(container);
    this.addChessComTooltip(container, move);
    
    return container;
  }

  static createChessComContainer(move) {
    const container = document.createElement('button');
    container.className = 'move-card-chesscom';
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      max-width: 320px;
      height: 28px;
      padding: 6px 10px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      background: white;
      cursor: pointer;
      transition: all 0.15s ease;
      margin: 1px 0;
      font-family: inherit;
    `;
    
    return container;
  }

  static createMoveInfo(move) {
    const container = document.createElement('div');
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 90px;
      flex-shrink: 0;
    `;

    // Zug
    const moveText = document.createElement('span');
    moveText.textContent = move.san || '?';
    moveText.style.cssText = `
      font-weight: bold;
      font-size: 13px;
      color: #2c3e50;
      min-width: 40px;
    `;

    // Anzahl
    const gamesText = document.createElement('span');
    const games = move.games || 0;
    gamesText.textContent = `(${games})`;
    gamesText.style.cssText = `
      font-size: 11px;
      color: ${games === 0 ? '#bdc3c7' : '#666'};
      min-width: 50px;
    `;

    container.appendChild(moveText);
    container.appendChild(gamesText);
    return container;
  }

  static createChessComBar(move) {
    const bar = document.createElement('div');
    bar.style.cssText = `
      width: 60px;
      height: 8px;
      border-radius: 4px;
      background: #e5e5e5;
      overflow: hidden;
      position: relative;
      flex-shrink: 0;
    `;

    const games = move.games || 0;
    if (games === 0) {
      bar.style.background = '#f5f5f5';
      bar.style.border = '1px dashed #ccc';
      return bar;
    }

    // Verwende Backend-berechnete Werte
    const winPercent = move.win_rate || 0;
    const drawPercent = move.draw_rate || 0;
    const lossPercent = move.lose_rate || 0;

    // Chess.com Farben
    this.addChessComSegment(bar, winPercent, '#81c784');
    this.addChessComSegment(bar, drawPercent, '#ffb74d');
    this.addChessComSegment(bar, lossPercent, '#e57373');

    return bar;
  }

  static addChessComSegment(container, percentage, color) {
    if (percentage <= 0) return;
    
    const segment = document.createElement('div');
    segment.style.cssText = `
      width: ${percentage}%;
      height: 100%;
      background: ${color};
      float: left;
    `;
    
    container.appendChild(segment);
  }

  static createWinrateDisplay(move) {
    const winrate = document.createElement('span');
    const winPercent = move.win_rate || 0;
    
    winrate.textContent = move.games === 0 ? '–' : `${Math.round(winPercent)}%`;
    winrate.style.cssText = `
      font-size: 11px;
      font-weight: 500;
      color: #666;
      min-width: 35px;
      text-align: right;
    `;
    
    return winrate;
  }

  static createCompactEloDisplay(move) {
    const elo = document.createElement('span');
    elo.style.cssText = `
      font-size: 11px;
      font-weight: 600;
      min-width: 40px;
      text-align: right;
      flex-shrink: 0;
    `;

    const eloDiff = move.avg_elo_diff;
    
    if (!eloDiff || isNaN(eloDiff)) {
      elo.textContent = '–';
      elo.style.color = '#bbb';
    } else {
      const rounded = Math.round(eloDiff);
      elo.textContent = rounded > 0 ? `+${rounded}` : `${rounded}`;
      elo.style.color = rounded > 0 ? '#4caf50' : 
                        rounded < 0 ? '#f44336' : '#757575';
    }

    return elo;
  }

  static addChessComEvents(container) {
    container.addEventListener('mouseenter', () => {
      container.style.background = '#fafafa';
      container.style.borderColor = '#4caf50';
      container.style.transform = 'scale(1.02)';
    });
    
    container.addEventListener('mouseleave', () => {
      container.style.background = 'white';
      container.style.borderColor = '#e0e0e0';
      container.style.transform = 'scale(1)';
    });
  }

  static addChessComTooltip(container, move) {
    const games = move.games || 0;
    if (games === 0) {
      container.title = `${move.san || '?'}: Keine Spieldaten verfügbar`;
      return;
    }

    const winPercent = Math.round(move.win_rate || 0);
    const drawPercent = Math.round(move.draw_rate || 0);
    const lossPercent = Math.round(move.lose_rate || 0);
    
    let tooltip = `${move.san || '?'}: ${games} Spiele\n`;
    tooltip += `Siege: ${Math.round((move.wins || 0))} (${winPercent}%)\n`;
    tooltip += `Remis: ${Math.round((move.draws || 0))} (${drawPercent}%)\n`;
    tooltip += `Niederlagen: ${Math.round((move.losses || 0))} (${lossPercent}%)`;
    
    const eloDiff = move.avg_elo_diff;
    if (eloDiff && !isNaN(eloDiff)) {
      const roundedElo = Math.round(eloDiff);
      tooltip += `\nELO-Differenz: ${roundedElo > 0 ? '+' : ''}${roundedElo}`;
    }
    
    container.title = tooltip;
  }
}

// Test Data
const testMoves = [
  {
    san: 'e4',
    games: 127,
    wins: 65,
    draws: 30,
    losses: 32,
    win_rate: 51.2,
    draw_rate: 23.6,
    lose_rate: 25.2,
    avg_elo_diff: 12
  },
  {
    san: 'd4',
    games: 89,
    wins: 42,
    draws: 25,
    losses: 22,
    win_rate: 47.2,
    draw_rate: 28.1,
    lose_rate: 24.7,
    avg_elo_diff: 8
  },
  {
    san: 'Nf3',
    games: 45,
    wins: 20,
    draws: 15,
    losses: 10,
    win_rate: 44.4,
    draw_rate: 33.3,
    lose_rate: 22.2,
    avg_elo_diff: 15
  }
];

// Test Function
window.testChessComStyle = function() {
  const container = document.createElement('div');
  container.style.cssText = 'padding: 20px; background: #f5f5f5;';
  
  testMoves.forEach(move => {
    const button = ChessComMoveStatsTest.createMoveButton(move);
    container.appendChild(button);
  });
  
  document.body.appendChild(container);
  console.log('Chess.com Style Test loaded. Call testChessComStyle() to see preview.');
};
