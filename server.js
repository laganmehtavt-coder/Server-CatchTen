const http = require('http');
const io = require('socket.io');

const server = http.createServer((req, res) => {

    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', message: 'Server is running!' }));
    } else {
        res.writeHead(404);
        res.end();
    }

});

const socketServer = io(server, {
    cors: { origin: "*" }
});

let rooms = {};

function time() {
    return new Date().toLocaleTimeString();
}

socketServer.on("connection", socket => {

    console.log(time(), "Client Connected:", socket.id);

    // ---------------- CREATE ROOM ----------------
    socket.on("createRoom", ({ name }) => {

        let roomID = Math.random().toString(36).substr(2, 9);

        rooms[roomID] = {
            players: [{ id: socket.id, name: name || "Guest", isHost: true }],
            gameStarted: false,
            rounds: []
        };

        socket.join(roomID);

        socket.emit("roomCreated", { roomID });

        sendPlayerList(roomID);

    });

    // ---------------- JOIN ROOM ----------------
    socket.on("joinRoom", ({ roomID, name }) => {

        if (!rooms[roomID]) {
            socket.emit("errorMsg", { message: "Room not found" });
            return;
        }

        const room = rooms[roomID];

        room.players.push({
            id: socket.id,
            name: name || "Guest",
            isHost: false
        });

        socket.join(roomID);

        sendPlayerList(roomID);

    });

    // ---------------- PLAYER LIST ----------------
    function sendPlayerList(roomID) {

        const room = rooms[roomID];
        if (!room) return;

        const list = room.players.map((p, i) => ({
            id: p.id,
            name: p.name,
            isHost: i === 0,
            isReady: p.isReady || false
        }));

        socketServer.to(roomID).emit("playerList", { players: list });

    }

    // ---------------- GAME START ----------------
    socket.on("gameStarted", ({ roomID }) => {

        if (!rooms[roomID]) return;

        rooms[roomID].gameStarted = true;

        console.log(time(), "Game Started:", roomID);

        socketServer.to(roomID).emit("gameStarted");

    });

    // ---------------- ROUND START ----------------
    socket.on("roundStart", ({ roomID, roundIndex, roundConfig }) => {

        if (!rooms[roomID]) return;

        console.log(time(), "Round Start:", roundIndex);

        socketServer.to(roomID).emit("roundStart", {
            roundIndex,
            roundConfig
        });

    });

    // ---------------- CARD DEALT ----------------
    socket.on("cardDealt", ({ roomID, card }) => {

        if (!rooms[roomID]) return;

        socket.to(roomID).emit("cardDealt", card);

    });

    // ---------------- PLAY CARD REQUEST ----------------
    socket.on("playCardRequest", ({ roomID, playerID, value, suit }) => {

        if (!rooms[roomID]) return;

        const room = rooms[roomID];

        const host = room.players.find(p => p.isHost);

        if (!host) return;

        console.log(time(), "Play Card Request:", value, suit);

        socketServer.to(host.id).emit("playCardRequest", {
            playerID,
            value,
            suit
        });

    });

    // ---------------- CARD PLAYED CONFIRM ----------------
    socket.on("cardPlayed", ({ roomID, playerID, value, suit }) => {

        if (!rooms[roomID]) return;

        console.log(time(), "Card Played:", value, suit);

        socketServer.to(roomID).emit("cardPlayed", {
            playerID,
            value,
            suit
        });

    });

    // ---------------- ROUND COMPLETE ----------------
    socket.on("roundComplete", ({ roomID, roundIndex }) => {

        if (!rooms[roomID]) return;

        console.log(time(), "Round Complete:", roundIndex);

        socketServer.to(roomID).emit("roundComplete", {
            roundIndex
        });

    });

    // ---------------- PLAYER READY ----------------
    socket.on("playerReady", ({ roomID }) => {

        if (!rooms[roomID]) return;

        const player = rooms[roomID].players.find(p => p.id === socket.id);

        if (player) player.isReady = true;

        sendPlayerList(roomID);

    });

    // ---------------- DISCONNECT ----------------
    socket.on("disconnect", () => {

        for (const roomID in rooms) {

            const room = rooms[roomID];

            room.players = room.players.filter(p => p.id !== socket.id);

            if (room.players.length === 0)
                delete rooms[roomID];
            else
                sendPlayerList(roomID);

        }

        console.log(time(), "Client Disconnected:", socket.id);

    });

});

server.listen(3000, () => {

    console.log("Server running on port 3000");

});