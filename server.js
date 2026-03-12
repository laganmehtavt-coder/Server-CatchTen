const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', message: 'Server is running!' }));
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

const io = new Server(server, { cors: { origin: "*", methods: ["GET","POST"] } });

let rooms = {};

function getTimestamp() {
    const now = new Date();
    return `[${now.toLocaleTimeString()}.${now.getMilliseconds()}]`;
}

const colors = {
    reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
    green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m'
};

function logCard(card, roomID) {
    if (!card) {
        console.warn(`${colors.yellow}${getTimestamp()} [ROOM:${roomID}] Card is undefined${colors.reset}`);
        return;
    }

    const cardID = card.cardID ?? 'N/A';
    const targetPlayer = card.targetPlayerID ?? 'N/A';
    const isTable = card.isTableCard ?? false;

    console.log(`${colors.green}${getTimestamp()}${colors.reset} ${colors.cyan}[ROOM:${roomID}]${colors.reset} CARD → ID: ${cardID}, Target: ${targetPlayer}, Table: ${isTable}`);
}

io.on("connection", socket => {
    console.log(`${colors.green}${getTimestamp()} Client connected: ${socket.id}${colors.reset}`);

    // Create Room
    socket.on("createRoom", ({ name }) => {
        const roomID = Math.random().toString(36).substr(2, 9).toUpperCase();
        rooms[roomID] = { players: [{ id: socket.id, name, isHost: true }], gameStarted: false };
        socket.join(roomID);
        socket.emit("roomCreated", { roomID });
        console.log(`${colors.green}${getTimestamp()} [ROOM:${roomID}] Created by ${name}${colors.reset}`);
    });

    // Join Room
    socket.on("joinRoom", ({ roomID, name }) => {
        const rID = roomID.toUpperCase();
        if (!rooms[rID]) { socket.emit("errorMsg", { message: "Room not found" }); return; }
        if (!rooms[rID].players.find(p => p.id === socket.id)) {
            rooms[rID].players.push({ id: socket.id, name, isHost: false });
            socket.join(rID);
        }
        io.to(rID).emit("playerList", { players: rooms[rID].players });
        console.log(`${colors.green}${getTimestamp()} [ROOM:${rID}] ${name} joined${colors.reset}`);
    });

    // Game Started by Host
    socket.on("gameStarted", ({ roomID }) => {
        const rID = roomID?.toUpperCase();
        if (!rID || !rooms[rID]) return;
        rooms[rID].gameStarted = true;
        console.log(`${colors.green}${getTimestamp()} [ROOM:${rID}] Game started by host${colors.reset}`);
        // Broadcast to all clients in the room
        io.to(rID).emit("gameStarted");
    });

    // Card Dealt (Host only) – forward full object
    socket.on("cardDealt", ({ roomID, card }) => {
        const rID = roomID?.toUpperCase();
        if (!rID || !rooms[rID]) return;
        logCard(card, rID);
        // Broadcast to other clients
        socket.to(rID).emit("cardDealt", card);
    });

    // Host Shuffle
    socket.on("hostShuffle", ({ roomID }) => {
        const rID = roomID?.toUpperCase();
        if (!rID || !rooms[rID]) return;
        console.log(`${colors.green}${getTimestamp()} [ROOM:${rID}] Host triggered shuffle${colors.reset}`);
        socket.to(rID).emit("hostShuffle");
    });

    // Disconnect
    socket.on("disconnect", () => {
        for (const rID in rooms) {
            const room = rooms[rID];
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                const name = room.players[index].name;
                room.players.splice(index, 1);
                console.log(`${colors.yellow}${getTimestamp()} [ROOM:${rID}] ${name} disconnected${colors.reset}`);
                if (room.players.length === 0) delete rooms[rID];
                else io.to(rID).emit("playerList", { players: room.players });
                break;
            }
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));