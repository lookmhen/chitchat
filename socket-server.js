const { createServer } = require("http");
const { Server } = require("socket.io");

const port = 3001;
const httpServer = createServer();
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// Helper to get active rooms
const getActiveRooms = () => {
    const rooms = [];
    const sids = io.sockets.adapter.sids;
    const allRooms = io.sockets.adapter.rooms;

    allRooms.forEach((sockets, roomName) => {
        if (!sids.has(roomName)) {
            rooms.push(roomName);
        }
    });

    return rooms;
};

// Helper to get users in a room
const getRoomUsers = (room) => {
    const users = [];
    const roomSockets = io.sockets.adapter.rooms.get(room);
    if (roomSockets) {
        roomSockets.forEach((socketId) => {
            const socket = io.sockets.sockets.get(socketId);
            if (socket && socket.data.username) {
                users.push(socket.data.username);
            }
        });
    }
    return users;
};

io.on("connection", (socket) => {
    console.log(`[${new Date().toISOString()}] Client connected: ${socket.id}`);

    socket.on("join", ({ username, room }) => {
        console.log(`${username} joining room: ${room}`);
        socket.join(room);
        socket.data.username = username;
        socket.data.room = room;

        socket.to(room).emit("message", {
            user: "System",
            text: `${username} has joined the room`,
            isSystem: true,
            timestamp: new Date().toISOString()
        });

        // Notify existing peers that a new user has joined (for WebRTC renegotiation)
        socket.to(room).emit("peer-joined", { username });

        // Broadcast updated user list
        io.to(room).emit("room-users", getRoomUsers(room));

        setTimeout(() => {
            const rooms = getActiveRooms();
            console.log("Broadcasting room list:", rooms);
            io.emit("room-list", rooms);
        }, 100);
    });

    socket.on("get-rooms", () => {
        const rooms = getActiveRooms();
        console.log(`Sending rooms to ${socket.id}:`, rooms);
        socket.emit("room-list", rooms);
    });

    socket.on("message", (data) => {
        if (socket.data.room) {
            io.to(socket.data.room).emit("message", data);
        }
    });

    // WebRTC Signaling
    socket.on("offer", (data) => {
        socket.to(socket.data.room).emit("offer", data);
    });

    socket.on("answer", (data) => {
        socket.to(socket.data.room).emit("answer", data);
    });

    socket.on("ice-candidate", (data) => {
        socket.to(socket.data.room).emit("ice-candidate", data);
    });

    // Typing Indicators
    socket.on("typing", () => {
        if (socket.data.room) {
            socket.to(socket.data.room).emit("typing", { username: socket.data.username });
        }
    });

    socket.on("stop-typing", () => {
        if (socket.data.room) {
            socket.to(socket.data.room).emit("stop-typing", { username: socket.data.username });
        }
    });

    // Message Reactions
    socket.on("reaction", (data) => {
        // data: { messageId, emoji, username }
        if (socket.data.room) {
            io.to(socket.data.room).emit("reaction-update", data);
        }
    });

    socket.on("disconnect", () => {
        console.log(`Client disconnected: ${socket.id}`);
        if (socket.data.username && socket.data.room) {
            socket.to(socket.data.room).emit("message", {
                user: "System",
                text: `${socket.data.username} has left the room`,
                isSystem: true,
                timestamp: new Date().toISOString()
            });

            // Broadcast updated user list
            io.to(socket.data.room).emit("room-users", getRoomUsers(socket.data.room));
        }

        setTimeout(() => {
            const rooms = getActiveRooms();
            console.log("Broadcasting room list after disconnect:", rooms);
            io.emit("room-list", rooms);
        }, 100);
    });
});

httpServer.listen(port, () => {
    console.log(`✅ Socket.IO server running on http://localhost:${port}`);
});
