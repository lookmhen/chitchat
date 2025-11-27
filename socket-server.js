const { createServer } = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const port = process.env.SOCKET_PORT || 3001;
const httpServer = createServer();
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Helper to get active rooms with metadata
const roomInfo = new Map(); // roomName -> { password, isPrivate, owner? }
const roomApprovals = new Map(); // roomName -> Set<username>
const roomMessages = new Map(); // roomName -> [messages]

const getActiveRooms = () => {
    const rooms = [];
    const sids = io.sockets.adapter.sids;
    const allRooms = io.sockets.adapter.rooms;

    allRooms.forEach((sockets, roomName) => {
        if (!sids.has(roomName)) {
            const info = roomInfo.get(roomName) || {};
            rooms.push({
                name: roomName,
                userCount: sockets.size,
                isPrivate: !!info.password
            });
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

    socket.on("join", ({ username, room, password }) => {
        console.log(`[JOIN] ${username} attempting to join room: '${room}' (Password provided: ${!!password})`);

        const existingInfo = roomInfo.get(room);
        const approvals = roomApprovals.get(room) || new Set();

        console.log(`[JOIN] Room '${room}' info:`, existingInfo ? "Found" : "Not Found");
        if (existingInfo) {
            console.log(`[JOIN] Room password: '${existingInfo.password}', Provided: '${password}'`);
        }

        // If room exists and has a password
        if (existingInfo && existingInfo.password) {
            // Check if user is approved
            if (approvals.has(username)) {
                console.log(`[JOIN] User ${username} is approved for room ${room}. Joining...`);
                approvals.delete(username);
                if (approvals.size === 0) roomApprovals.delete(room);
            } else if (password !== existingInfo.password) {
                console.log(`[JOIN] Password mismatch for room '${room}'`);
                // If password provided but wrong, or no password provided
                if (password) {
                    socket.emit("join-error", "Incorrect password");
                    return;
                }

                socket.emit("join-error", "Password required");
                return;
            } else {
                console.log(`[JOIN] Password matched for room '${room}'`);
            }
        } else if (!existingInfo && password) {
            console.log(`[JOIN] Creating new private room '${room}'`);
            // New room with password
            roomInfo.set(room, { password, isPrivate: true });
        }

        // Join successful
        console.log(`[JOIN] Successfully joining room '${room}'`);
        socket.join(room);
        socket.data.username = username;
        socket.data.room = room;

        // Send message history
        const history = roomMessages.get(room) || [];
        socket.emit("message-history", history);

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

    // Request to join a private room without password
    socket.on("join-request", ({ username, room }) => {
        const info = roomInfo.get(room);
        if (info && info.password) {
            // Store username in socket data for reference
            socket.data.username = username;

            // Notify all users in the room
            io.to(room).emit("join-request-received", { username, socketId: socket.id });
            socket.emit("join-request-pending");
        } else {
            // Public room, just join (client should call join)
            socket.emit("request-approved", { room });
        }
    });

    // Approve a join request
    socket.on("approve-request", ({ socketId, room }) => {
        // Verify the approver is in the room
        if (socket.data.room === room) {
            const requesterSocket = io.sockets.sockets.get(socketId);
            if (requesterSocket && requesterSocket.data.username) {
                const username = requesterSocket.data.username;

                // Add to approvals list
                if (!roomApprovals.has(room)) {
                    roomApprovals.set(room, new Set());
                }
                roomApprovals.get(room).add(username);

                console.log(`Approved access for ${username} to room ${room}`);

                io.to(socketId).emit("request-approved", { room });
            }
        }
    });

    // Deny a join request
    socket.on("deny-request", ({ socketId, room }) => {
        if (socket.data.room === room) {
            io.to(socketId).emit("join-error", "Request denied by room member");
        }
    });

    socket.on("get-rooms", () => {
        const rooms = getActiveRooms();
        console.log(`Sending rooms to ${socket.id}:`, rooms);
        socket.emit("room-list", rooms);
    });

    socket.on("message", (data) => {
        console.log(`[MESSAGE] Received from ${socket.data.username} in room ${socket.data.room}:`, data);
        if (socket.data.room) {
            const room = socket.data.room;

            // Store message
            if (!roomMessages.has(room)) {
                roomMessages.set(room, []);
            }
            const messages = roomMessages.get(room);
            messages.push(data);

            // Keep only last 50 messages
            if (messages.length > 50) {
                messages.shift();
            }

            console.log(`[MESSAGE] Broadcasting to room ${room}`);
            io.to(room).emit("message", data);
        } else {
            console.log(`[MESSAGE] Error: User ${socket.id} not in a room`);
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

            // Clean up room info if empty
            const room = socket.data.room;
            const roomSockets = io.sockets.adapter.rooms.get(room);
            if (!roomSockets || roomSockets.size === 0) {
                roomInfo.delete(room);
                roomApprovals.delete(room);
            }
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
