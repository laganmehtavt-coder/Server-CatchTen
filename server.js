const http = require('http');
const io = require('socket.io');

const server = http.createServer();
const socketServer = io(server, {
    cors: { origin: "*" }
});

let rooms = {};

// Helper function to get current timestamp
function getTimestamp() {
    const now = new Date();
    return `[${now.toLocaleTimeString()}.${now.getMilliseconds()}]`;
}

// Helper to log with colors (for better readability)
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
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

socketServer.on("connection", socket => {
    console.log(`${colors.green}${getTimestamp()}${colors.reset} ${colors.bright}Client connected:${colors.reset}`, socket.id);

    socket.on("createRoom", ({ name }) => {
        let roomID = Math.random().toString(36).substr(2, 9);
        
        rooms[roomID] = {
            players: [{
                id: socket.id,
                name: name || "Guest",
                isHost: true
            }],
            gameStarted: false,
            cardHistory: [] // Optional: store card history
        };
        
        socket.join(roomID);
        socket.emit("roomCreated", { roomID });
        
        console.log(`${colors.green}${getTimestamp()}${colors.reset} ${colors.bright}🏠 Room Created:${colors.reset} ${colors.yellow}${roomID}${colors.reset} by ${colors.cyan}${name || 'Guest'}${colors.reset}`);
        
        sendUniquePlayerList(roomID);
    });

    socket.on("joinRoom", ({ roomID, name }) => {
        if (!rooms[roomID]) {
            console.log(`${colors.red}${getTimestamp()}${colors.reset} ${colors.red}❌ Join failed: Room ${roomID} not found${colors.reset}`);
            socket.emit("errorMsg", { message: "Room not found" });
            return;
        }

        const exists = rooms[roomID].players.find(p => p.id === socket.id);

        if (!exists) {
            rooms[roomID].players.push({
                id: socket.id,
                name: name || "Guest",
                isHost: false
            });
            socket.join(roomID);
            
            console.log(`${colors.green}${getTimestamp()}${colors.reset} ${colors.bright}👤 Player Joined:${colors.reset} ${colors.cyan}${name || 'Guest'}${colors.reset} ${colors.dim}(${socket.id})${colors.reset} ${colors.yellow}→ Room: ${roomID}${colors.reset}`);
            console.log(`${colors.dim}  └─ Total players now: ${rooms[roomID].players.length}${colors.reset}`);
        }

        sendUniquePlayerList(roomID);
    });

    // Card dealt event with detailed logging
    socket.on("cardDealt", ({ roomID, card }) => {
        if (!rooms[roomID]) {
            console.log(`${colors.red}${getTimestamp()}${colors.reset} ${colors.red}❌ Card dealt to non-existent room: ${roomID}${colors.reset}`);
            return;
        }
        
        // Log the card being dealt
        logCard('🎴 CARD DEALT:', card, roomID);
        
        // Track in room history (optional)
        if (!rooms[roomID].cardHistory) {
            rooms[roomID].cardHistory = [];
        }
        rooms[roomID].cardHistory.push({
            timestamp: new Date().toISOString(),
            card: card,
            dealtBy: socket.id
        });
        
        // Broadcast to other clients
        socket.to(roomID).emit("cardDealt", card);
        
        // Log broadcast
        console.log(`${colors.dim}  └─ 📤 Broadcast to ${rooms[roomID].players.length - 1} other clients${colors.reset}`);
    });

    // Round start with logging
    socket.on("roundStart", ({ roomID, roundIndex, roundConfig }) => {
        if (!rooms[roomID]) return;
        
        logRound('🔴 ROUND STARTED', roomID, roundIndex, 
            `(Table: ${roundConfig.tableCards} cards, Player: ${roundConfig.playerCardsEach} cards each)`);
        
        socket.to(roomID).emit("roundStart", { roundIndex, roundConfig });
    });

    // Round complete with logging
    socket.on("roundComplete", ({ roomID, roundIndex }) => {
        if (!rooms[roomID]) return;
        
        logRound('✅ ROUND COMPLETE', roomID, roundIndex);
        
        // Show round summary
        if (rooms[roomID].cardHistory) {
            const roundCards = rooms[roomID].cardHistory.filter(c => c.card.roundIndex === roundIndex);
            console.log(`${colors.dim}  └─ Cards dealt this round: ${roundCards.length}${colors.reset}`);
        }
        
        socket.to(roomID).emit("roundComplete", { roundIndex });
    });


    // ---------------------- Health Check API ----------------------
server.on('request', (req, res) => {
    if (req.url === '/health') {   // check this endpoint
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', message: 'Server is running!' }));
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});
    // Player ready event
    socket.on("playerReady", ({ roomID }) => {
        if (!rooms[roomID]) return;
        
        const player = rooms[roomID].players.find(p => p.id === socket.id);
        if (player) {
            player.isReady = true;
            console.log(`${colors.yellow}${getTimestamp()}${colors.reset} ${colors.bright}✅ Player Ready:${colors.reset} ${colors.cyan}${player.name}${colors.reset} in room ${roomID}`);
            
            const readyCount = rooms[roomID].players.filter(p => p.isReady).length;
            console.log(`${colors.dim}  └─ Ready: ${readyCount}/${rooms[roomID].players.length} players${colors.reset}`);
            
            sendUniquePlayerList(roomID);
        }
    });

    function sendUniquePlayerList(roomID) {
        if (rooms[roomID]) {
            const playersList = rooms[roomID].players.map((p, index) => ({
                id: p.id,
                name: p.name,
                isReady: p.isReady || false,
                isHost: index === 0 // First player in room is host
            }));
            
            socketServer.to(roomID).emit("playerList", { players: playersList });
            
            // Log player list update
            console.log(`${colors.blue}${getTimestamp()}${colors.reset} ${colors.bright}📋 Player List Updated:${colors.reset}`);
            playersList.forEach((p, i) => {
                const hostStar = p.isHost ? '👑 ' : '  ';
                const readyMark = p.isReady ? '✅' : '⏳';
                console.log(`${colors.dim}  ${i+1}. ${hostStar}${colors.cyan}${p.name}${colors.reset} ${readyMark} ${colors.dim}(${p.id})${colors.reset}`);
            });
        }
    }

    socket.on("disconnect", () => {
        console.log(`${colors.yellow}${getTimestamp()}${colors.reset} ${colors.red}❌ Client disconnected:${colors.reset}`, socket.id);
        
        for (const roomID in rooms) {
            const room = rooms[roomID];
            const player = room.players.find(p => p.id === socket.id);
            
            if (player) {
                console.log(`${colors.dim}  └─ Removing ${player.name} from room ${roomID}${colors.reset}`);
            }
            
            const initialLength = room.players.length;
            room.players = room.players.filter(p => p.id !== socket.id);

            if (room.players.length !== initialLength) {
                sendUniquePlayerList(roomID);
            }

            if (room.players.length === 0) {
                delete rooms[roomID];
                console.log(`${colors.red}${getTimestamp()}${colors.reset} ${colors.red}🗑️ Room deleted: ${roomID} (empty)${colors.reset}`);
            }
        }
    });
});

// Log server start
console.log(`${colors.green}${getTimestamp()}${colors.reset} ${colors.bright}🚀 Socket.IO server listening on port 3000${colors.reset}`);
console.log(`${colors.cyan}${getTimestamp()}${colors.reset} ${colors.dim}Waiting for connections...${colors.reset}\n`);

server.listen(3000);