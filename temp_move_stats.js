  // ====================================================================
  // MoveStatsRenderer - Kompakte, professionelle Move-Statistiken
  // ====================================================================
  class MoveStatsRenderer {
    static createMoveButton(move, boardOrientation, allYears, isSingleLine = false) {
      const container = document.createElement('button');
      container.className = 'move-stats-card';
      container.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        height: 32px;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        background: white;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: inherit;
        margin: 2px 0;
      `;

      // Accessibility
      const games = move.games || 0;
      const winPercent = games > 0 ? Math.round(((move.wins || 0) / games) * 100) : 0;
      const eloDiff = move.avg_elo_diff || 0;
      
      container.setAttribute('aria-label', 
        `Zug ${move.san || '?'}, ${games} Spiele gespielt, ${winPercent}% Siegrate, ELO-Differenz ${eloDiff > 0 ? '+' : ''}${eloDiff}`
      );
      container.setAttribute('role', 'button');
      container.setAttribute('tabindex', '0');

      // Hover-Effekte
      container.addEventListener('mouseenter', () => {
        container.style.background = '#f8f9fa';
        container.style.borderColor = '#3498db';
        container.style.transform = 'translateY(-1px)';
        container.style.boxShadow = '0 2px 8px rgba(52, 152, 219, 0.2)';
      });
      
      container.addEventListener('mouseleave', () => {
        container.style.background = 'white';
        container.style.borderColor = '#ddd';
        container.style.transform = 'translateY(0)';
        container.style.boxShadow = 'none';
      });

      // Keyboard navigation
      container.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          container.click();
        }
      });

      // Komponenten erstellen
      const moveSection = this.createMoveSection(move);
      const statsBar = this.createCompactStatsBar(move);
      const eloDisplay = this.createEloDisplay(move);

      container.appendChild(moveSection);
      container.appendChild(statsBar);
      container.appendChild(eloDisplay);

      // Tooltip mit detaillierten Informationen
      this.addDetailedTooltip(container, move);

      return container;
    }

    static createMoveSection(move) {
      const section = document.createElement('div');
      section.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 90px;
        flex-shrink: 0;
      `;

      const moveText = document.createElement('span');
      moveText.textContent = move.san || '?';
      moveText.style.cssText = `
        font-weight: bold;
        font-size: 14px;
        color: #2c3e50;
        min-width: 40px;
      `;

      const gamesText = document.createElement('span');
      const games = move.games || 0;
      gamesText.textContent = `(${games})`;
      gamesText.style.cssText = `
        font-size: 12px;
        color: ${games === 0 ? '#bdc3c7' : '#666'};
        min-width: 50px;
      `;

      section.appendChild(moveText);
      section.appendChild(gamesText);
      return section;
    }

    static createCompactStatsBar(move) {
      const bar = document.createElement('div');
      bar.style.cssText = `
        display: flex;
        width: 80px;
        height: 16px;
        border-radius: 8px;
        border: 1px solid #ccc;
        overflow: hidden;
        flex-shrink: 0;
        position: relative;
      `;

      const games = move.games || 0;
      const wins = move.wins || 0;
      const draws = move.draws || 0;
      const losses = move.losses || 0;

      // Edge Case: Keine Daten
      if (games === 0) {
        bar.style.background = '#f8f9fa';
        bar.style.border = '1px dashed #ccc';
        bar.setAttribute('aria-label', 'Keine Spieldaten verfügbar');
        return bar;
      }

      // Validierung & Normalisierung
      const total = wins + draws + losses;
      if (total === 0) {
        bar.style.background = '#f8f9fa';
        bar.style.border = '1px dashed #ccc';
        return bar;
      }

      // Prozentuale Berechnung
      const winPercent = (wins / games) * 100;
      const drawPercent = (draws / games) * 100;
      const lossPercent = (losses / games) * 100;

      // Segmente erstellen
      if (winPercent > 0) {
        this.addBarSegment(bar, winPercent, '#ffffff', '1px solid #999', `Siege: ${wins} (${Math.round(winPercent)}%)`);
      }
      if (drawPercent > 0) {
        this.addBarSegment(bar, drawPercent, '#888888', 'none', `Remis: ${draws} (${Math.round(drawPercent)}%)`);
      }
      if (lossPercent > 0) {
        this.addBarSegment(bar, lossPercent, '#333333', 'none', `Niederlagen: ${losses} (${Math.round(lossPercent)}%)`);
      }

      // Accessibility Label für die gesamte Bar
      bar.setAttribute('aria-label', 
        `Statistik: ${Math.round(winPercent)}% Siege, ${Math.round(drawPercent)}% Remis, ${Math.round(lossPercent)}% Niederlagen`
      );

      return bar;
    }

    static addBarSegment(container, percentage, backgroundColor, border = 'none', tooltip = '') {
      const segment = document.createElement('div');
      segment.style.cssText = `
        width: ${percentage}%;
        height: 100%;
        background: ${backgroundColor};
        border: ${border};
        box-sizing: border-box;
      `;
      
      if (tooltip) {
        segment.title = tooltip;
      }
      
      container.appendChild(segment);
    }

    static createEloDisplay(move) {
      const elo = document.createElement('span');
      elo.style.cssText = `
        font-size: 12px;
        font-weight: 500;
        min-width: 40px;
        text-align: right;
        flex-shrink: 0;
      `;

      const eloDiff = move.avg_elo_diff;
      
      if (!eloDiff || isNaN(eloDiff)) {
        elo.textContent = '–';
        elo.style.color = '#bdc3c7';
        elo.title = 'Keine ELO-Daten verfügbar';
      } else {
        // ELO-Werte begrenzen für bessere Darstellung
        const clampedDiff = Math.min(Math.max(Math.round(eloDiff), -999), 999);
        elo.textContent = clampedDiff > 0 ? `+${clampedDiff}` : `${clampedDiff}`;
        
        // Farbkodierung
        if (clampedDiff > 0) {
          elo.style.color = '#27ae60'; // Grün für positive Werte
        } else if (clampedDiff < 0) {
          elo.style.color = '#e74c3c'; // Rot für negative Werte
        } else {
          elo.style.color = '#7f8c8d'; // Grau für neutral
        }
        
        elo.title = `Durchschnittliche ELO-Differenz: ${clampedDiff > 0 ? '+' : ''}${clampedDiff}`;
      }

      return elo;
    }

    static addDetailedTooltip(container, move) {
      const games = move.games || 0;
      const wins = move.wins || 0;
      const draws = move.draws || 0;
      const losses = move.losses || 0;
      const eloDiff = move.avg_elo_diff;
      
      if (games === 0) {
        container.title = `${move.san || '?'}: Keine Spieldaten verfügbar`;
        return;
      }

      const winPercent = Math.round((wins / games) * 100);
      const drawPercent = Math.round((draws / games) * 100);
      const lossPercent = Math.round((losses / games) * 100);
      
      let tooltip = `${move.san || '?'}: ${games} Spiele\n`;
      tooltip += `Siege: ${wins} (${winPercent}%)\n`;
      tooltip += `Remis: ${draws} (${drawPercent}%)\n`;
      tooltip += `Niederlagen: ${losses} (${lossPercent}%)`;
      
      if (eloDiff && !isNaN(eloDiff)) {
        const roundedElo = Math.round(eloDiff);
        tooltip += `\nELO-Differenz: ${roundedElo > 0 ? '+' : ''}${roundedElo}`;
      }
      
      container.title = tooltip;
    }
  }
