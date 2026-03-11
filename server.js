const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
    // Health Check API
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', message: 'Server is running!' }));
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let rooms = {};

// Helper Functions
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

// Socket.IO Logic
io.on("connection", socket => {
    console.log(`${colors.green}${getTimestamp()}${colors.reset} ${colors.bright}Client connected:${colors.reset} ${socket.id}`);

    // Create Room
    socket.on("createRoom", ({ name }) => {
        const roomID = Math.random().toString(36).substr(2, 9).toUpperCase();
        rooms[roomID] = { 
            players: [{ id: socket.id, name: name || "Guest", isHost: true, isReady: false }], 
            gameStarted: false, 
            cardHistory: [],
            rounds: []
        };
        socket.join(roomID);
        socket.emit("roomCreated", { roomID });
        sendPlayerList(roomID);
        console.log(`${colors.green}${getTimestamp()}${colors.reset} ${colors.cyan}[ROOM:${roomID}]${colors.reset} Created by ${name}`);
    });

    // Join Room
    socket.on("joinRoom", ({ roomID, name }) => {
        const roomId = roomID.toUpperCase();
        if (!rooms[roomId]) { 
            socket.emit("errorMsg", { message: "Room not found" }); 
            return; 
        }
        
        if (!rooms[roomId].players.find(p => p.id === socket.id)) {
            rooms[roomId].players.push({ 
                id: socket.id, 
                name: name || "Guest", 
                isHost: false,
                isReady: false 
            });
            socket.join(roomId);
        }
        sendPlayerList(roomId);
        console.log(`${colors.green}${getTimestamp()}${colors.reset} ${colors.cyan}[ROOM:${roomId}]${colors.reset} ${name} joined`);
    });

    // Game Started by Host
    socket.on("gameStarted", ({ roomID }) => {
        const roomId = roomID?.toUpperCase();
        if (!roomId || !rooms[roomId]) return;
        
        const room = rooms[roomId];
        room.gameStarted = true;
        console.log(`${colors.magenta}${getTimestamp()}${colors.reset} ${colors.cyan}[ROOM:${roomId}]${colors.reset} 🎮 Game STARTED by host`);

        // Notify all clients in the room
        io.to(roomId).emit("gameStarted");
    });

    // Round Start
    socket.on("roundStart", ({ roomID, roundIndex, roundConfig }) => {
        const roomId = roomID?.toUpperCase();
        if (!roomId || !rooms[roomId]) return;
        
        const room = rooms[roomId];
        if (!room.rounds[roundIndex]) 
            room.rounds[roundIndex] = { tableCards: [], playerCards: {} };

        logRound('🔴 ROUND STARTED', roomId, roundIndex, 
            `(Table: ${roundConfig.tableCards} cards, Player: ${roundConfig.playerCardsEach} cards each)`);

        io.to(roomId).emit("roundStart", { roundIndex, roundConfig });
    });

    // Card Dealt (HOST ONLY)
    socket.on("cardDealt", ({ roomID, card }) => {
        const roomId = roomID?.toUpperCase();
        if (!roomId || !rooms[roomId]) return;
        
        const room = rooms[roomId];
        logCard('🎴 CARD DEALT:', card, roomId);
        
        room.cardHistory.push({ 
            timestamp: new Date().toISOString(), 
            card, 
            dealtBy: socket.id 
        });

        // Save card per round
        if (!room.rounds[card.roundIndex]) 
            room.rounds[card.roundIndex] = { tableCards: [], playerCards: {} };
            
        if (card.isTableCard) {
            room.rounds[card.roundIndex].tableCards.push(card);
        } else {
            if (!room.rounds[card.roundIndex].playerCards[card.targetPlayerID]) 
                room.rounds[card.roundIndex].playerCards[card.targetPlayerID] = [];
            room.rounds[card.roundIndex].playerCards[card.targetPlayerID].push(card);
        }

        // Broadcast to all clients EXCEPT sender
        socket.to(roomId).emit("cardDealt", card);
    });

    // Round Complete
    socket.on("roundComplete", ({ roomID, roundIndex }) => {
        const roomId = roomID?.toUpperCase();
        if (!roomId || !rooms[roomId]) return;
        
        logRound('✅ ROUND COMPLETE', roomId, roundIndex);
        io.to(roomId).emit("roundComplete", { roundIndex });
    });

    // Player Ready
    socket.on("playerReady", ({ roomID }) => {
        const roomId = roomID?.toUpperCase();
        if (!roomId || !rooms[roomId]) return;
        
        const player = rooms[roomId].players.find(p => p.id === socket.id);
        if (player) { 
            player.isReady = true; 
            sendPlayerList(roomId);
        }
    });

    // Disconnect
    socket.on("disconnect", () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            
            if (playerIndex !== -1) {
                const playerName = room.players[playerIndex].name;
                room.players.splice(playerIndex, 1);
                
                if (room.players.length === 0) {
                    delete rooms[roomId];
                    console.log(`${colors.red}${getTimestamp()}${colors.reset} ${colors.cyan}[ROOM:${roomId}]${colors.reset} Room deleted - empty`);
                } else {
                    // If host left, make next player host
                    if (playerIndex === 0 && room.players.length > 0) {
                        room.players[0].isHost = true;
                        console.log(`${colors.yellow}${getTimestamp()}${colors.reset} ${colors.cyan}[ROOM:${roomId}]${colors.reset} New host: ${room.players[0].name}`);
                    }
                    sendPlayerList(roomId);
                }
                console.log(`${colors.red}${getTimestamp()}${colors.reset} ${colors.cyan}[ROOM:${roomId}]${colors.reset} ${playerName} disconnected`);
                break;
            }
        }
    });

    // Helper: Send Player List
    function sendPlayerList(roomID) {
        const room = rooms[roomID]; 
        if (!room) return;
        
        const playersList = room.players.map((p, i) => ({ 
            id: p.id, 
            name: p.name, 
            isReady: p.isReady || false, 
            isHost: i === 0 
        }));
        
        io.to(roomID).emit("playerList", { players: playersList });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`${colors.green}${getTimestamp()}${colors.reset} 🚀 Server running on port ${PORT}`);
    console.log(`${colors.green}${getTimestamp()}${colors.reset} 📍 Local: http://localhost:${PORT}`);
});