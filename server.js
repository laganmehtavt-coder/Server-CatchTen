const http = require('http');
const io = require('socket.io');

const server = http.createServer((req, res) => {
    // ---------------------- Health Check API ----------------------
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', message: 'Server is running!' }));
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

const socketServer = io(server, {
    cors: { origin: "*" }
});

let rooms = {};

// ---------------------- Helper Functions ----------------------
function getTimestamp() {
    const now = new Date();
    return `[${now.toLocaleTimeString()}.${now.getMilliseconds()}]`;
}

const colors = {
    reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m'
};

function logCard(message, card, roomID) {
    console.log(`${colors.green}${getTimestamp()}${colors.reset} ${colors.cyan}[ROOM:${roomID}]${colors.reset} ${colors.yellow}${message}${colors.reset}`);
    console.log(`${colors.dim}  ├─ Card ID: ${colors.white}${card.cardID || 'N/A'}${colors.reset}`);
    console.log(`${colors.dim}  ├─ Sprite: ${colors.white}${card.spriteName || 'N/A'}${colors.reset}`);
    console.log(`${colors.dim}  ├─ Value: ${colors.white}${card.value || 'N/A'}${colors.reset}`);
    console.log(`${colors.dim}  ├─ Suit: ${colors.white}${card.suit || 'N/A'}${colors.reset}`);
    console.log(`${colors.dim}  ├─ Type: ${colors.white}${card.isTableCard ? 'TABLE CARD' : 'PLAYER CARD'}${colors.reset}`);
    if (!card.isTableCard) {
        console.log(`${colors.dim}  └─ Target Player: ${colors.white}${card.targetPlayerID || 'N/A'}${colors.reset}`);
    } else {
        console.log(`${colors.dim}  └─ Table Card Index: ${colors.white}${card.cardIndex || 'N/A'}${colors.reset}`);
    }
}

function logRound(message, roomID, roundIndex, details = '') {
    console.log(`${colors.blue}${getTimestamp()}${colors.reset} ${colors.cyan}[ROOM:${roomID}]${colors.reset} ${colors.magenta}${message}${colors.reset} Round: ${colors.bright}${roundIndex}${colors.reset} ${details}`);
}

// ---------------------- Socket.IO Logic ----------------------
socketServer.on("connection", socket => {
    console.log(`${colors.green}${getTimestamp()}${colors.reset} ${colors.bright}Client connected:${colors.reset}`, socket.id);

    // --- Create Room ---
    socket.on("createRoom", ({ name }) => {
        let roomID = Math.random().toString(36).substr(2, 9);
        rooms[roomID] = { players: [{ id: socket.id, name: name || "Guest", isHost: true }], gameStarted: false, cardHistory: [] };
        socket.join(roomID);
        socket.emit("roomCreated", { roomID });
        sendUniquePlayerList(roomID);
    });

    // --- Join Room ---
    socket.on("joinRoom", ({ roomID, name }) => {
        if (!rooms[roomID]) { socket.emit("errorMsg", { message: "Room not found" }); return; }
        if (!rooms[roomID].players.find(p => p.id === socket.id)) {
            rooms[roomID].players.push({ id: socket.id, name: name || "Guest", isHost: false });
            socket.join(roomID);
        }
        sendUniquePlayerList(roomID);
    });

    // --- Card Dealt ---
    socket.on("cardDealt", ({ roomID, card }) => {
        if (!rooms[roomID]) return;
        logCard('🎴 CARD DEALT:', card, roomID);
        rooms[roomID].cardHistory.push({ timestamp: new Date().toISOString(), card: card, dealtBy: socket.id });
        socket.to(roomID).emit("cardDealt", card);
    });

    // --- Round Start ---
    socket.on("roundStart", ({ roomID, roundIndex, roundConfig }) => {
        if (!rooms[roomID]) return;
        logRound('🔴 ROUND STARTED', roomID, roundIndex, `(Table: ${roundConfig.tableCards} cards, Player: ${roundConfig.playerCardsEach} cards each)`);
        socket.to(roomID).emit("roundStart", { roundIndex, roundConfig });
    });

    // --- Round Complete ---
    socket.on("roundComplete", ({ roomID, roundIndex }) => {
        if (!rooms[roomID]) return;
        logRound('✅ ROUND COMPLETE', roomID, roundIndex);
        socket.to(roomID).emit("roundComplete", { roundIndex });
    });

    // --- Player Ready ---
    socket.on("playerReady", ({ roomID }) => {
        if (!rooms[roomID]) return;
        const player = rooms[roomID].players.find(p => p.id === socket.id);
        if (player) { player.isReady = true; sendUniquePlayerList(roomID); }
    });

    // --- Disconnect ---
    socket.on("disconnect", () => {
        for (const roomID in rooms) {
            const room = rooms[roomID];
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) delete rooms[roomID];
            else sendUniquePlayerList(roomID);
        }
    });

    // --- Helper: Send Player List ---
    function sendUniquePlayerList(roomID) {
        const room = rooms[roomID]; if (!room) return;
        const playersList = room.players.map((p, i) => ({ id: p.id, name: p.name, isReady: p.isReady || false, isHost: i === 0 }));
        socketServer.to(roomID).emit("playerList", { players: playersList });
    }
});

// ---------------------- Start Server ----------------------
server.listen(3000, () => {
    console.log(`${colors.green}${getTimestamp()}${colors.reset} 🚀 Server running on port 3000`);
});