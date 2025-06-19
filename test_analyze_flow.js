// Test Script für "Eröffnungen analysieren" Button Flow
// Dieses Skript simuliert den kompletten Ablauf und loggt jeden Schritt

(async function testAnalyzeFlow() {
    console.clear();
    console.log("🚀 STARTING COMPLETE ANALYZE FLOW TEST");
    console.log("=====================================");
    
    // Schritt 1: Prüfe ob ChessApp geladen ist
    console.log("📋 Step 1: Checking if ChessApp is loaded...");
    if (typeof window.chessApp === 'undefined') {
        console.error("❌ ChessApp not found in window.chessApp");
        return;
    }
    console.log("✅ ChessApp found");
    
    // Schritt 2: Spieler auswählen (Magnus Carlsen)
    console.log("\n📋 Step 2: Selecting player (Magnus Carlsen)...");
    const playerSelect = document.getElementById('playerSelect');
    if (!playerSelect) {
        console.error("❌ Player select element not found");
        return;
    }
    
    // Magnus Carlsen auswählen
    playerSelect.value = 'Magnus_Carlsen';
    playerSelect.dispatchEvent(new Event('change'));
    console.log("✅ Player selected: Magnus_Carlsen");
    
    // Schritt 3: Farbe auswählen (weiß)
    console.log("\n📋 Step 3: Selecting color (white)...");
    const whiteRadio = document.querySelector('input[name="colorSelect"][value="white"]');
    if (!whiteRadio) {
        console.error("❌ White color radio not found");
        return;
    }
    whiteRadio.checked = true;
    whiteRadio.dispatchEvent(new Event('change'));
    console.log("✅ Color selected: white");
    
    // Schritt 4: Warten kurz und dann den Analyze Button finden
    console.log("\n📋 Step 4: Finding analyze button...");
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (!analyzeBtn) {
        console.error("❌ Analyze button not found");
        return;
    }
    console.log("✅ Analyze button found");
    
    // Schritt 5: Vor dem Klick - aktuellen State loggen
    console.log("\n📋 Step 5: Logging current ChessApp state before analyze...");
    console.log("Current player:", window.chessApp.state.player);
    console.log("Current color:", window.chessApp.state.color);
    console.log("Current boardOrientation:", window.chessApp.state.boardOrientation);
    console.log("ApiService exists:", !!window.chessApp.apiService);
    console.log("BoardController exists:", !!window.chessApp.boardController);
    console.log("UIManager exists:", !!window.chessApp.uiManager);
    
    // Schritt 6: Auf Analyze klicken und alle Logs verfolgen
    console.log("\n🔥 Step 6: CLICKING ANALYZE BUTTON - MONITORING ALL LOGS...");
    console.log("================================================================");
    
    try {
        // Button klicken
        analyzeBtn.click();
        
        // Warten auf Completion (3 Sekunden sollten reichen)
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log("\n📋 Step 7: Analyzing results after analyze click...");
        
        // State nach dem Klick prüfen
        console.log("Final player:", window.chessApp.state.player);
        console.log("Final color:", window.chessApp.state.color);
        console.log("Final boardOrientation:", window.chessApp.state.boardOrientation);
        console.log("Final history length:", window.chessApp.state.history.length);
        console.log("Final currentPosition:", window.chessApp.state.currentPosition);
        
        // UI Elemente prüfen
        const movesList = document.getElementById('movesList');
        const movesCount = movesList ? movesList.children.length : 0;
        console.log("Moves displayed in UI:", movesCount);
        
        // Backend-Check
        const backendStatus = await fetch('/api/status').then(r => r.json());
        console.log("Backend current_player:", backendStatus.current_player);
        console.log("Backend current_perspective:", backendStatus.current_perspective);
        
        console.log("\n🎉 ANALYZE FLOW TEST COMPLETED");
        console.log("===============================");
        
    } catch (error) {
        console.error("💥 ERROR during analyze flow:", error);
        console.error("Error details:", error.stack);
    }
})();
