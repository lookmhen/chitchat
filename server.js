const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

console.log("Starting Next.js app preparation...");
app.prepare().then(() => {
  console.log("Next.js app prepared successfully!");
  const httpServer = createServer(handler);
  const io = new Server(httpServer);

  // Helper to get active rooms
  const getActiveRooms = () => {
    const rooms = [];
    const sids = io.sockets.adapter.sids;
    const allRooms = io.sockets.adapter.rooms;

    console.log("=== Getting Active Rooms ===");
    console.log("All rooms:", Array.from(allRooms.keys()));
    console.log("All SIDs:", Array.from(sids.keys()));

    allRooms.forEach((sockets, roomName) => {
      // A room is "active" if it's not just a socket ID's personal room
      if (!sids.has(roomName)) {
        console.log(`Found active room: ${roomName} with ${sockets.size} members`);
        rooms.push(roomName);
      }
    });

    console.log("Final active rooms list:", rooms);
    return rooms;
  };

  io.on("connection", (socket) => {
    console.log(`[${new Date().toISOString()}] Client connected: ${socket.id}`);

    socket.on("join", ({ username, room }) => {
      console.log(`[${new Date().toISOString()}] ${username} joining room: ${room}`);

      // Notify existing members that a new peer joined
      socket.to(room).emit("peer-joined", { username });
      console.log(`👋 Notified room ${room} that ${username} joined`);

      socket.join(room);
      socket.data.username = username;
      socket.data.room = room;

      socket.to(room).emit("message", {
        user: "System",
        text: `${username} has joined the room`,
        isSystem: true,
        timestamp: new Date().toISOString()
      });

      // Broadcast updated room list with a small delay
      setTimeout(() => {
        const rooms = getActiveRooms();
        console.log(`Broadcasting room list to all clients:`, rooms);
        io.emit("room-list", rooms);
      }, 100);
    });

    socket.on("get-rooms", () => {
      const rooms = getActiveRooms();
      console.log(`Client ${socket.id} requested rooms. Sending:`, rooms);
      socket.emit("room-list", rooms);
    });

    socket.on("message", (data) => {
      if (socket.data.room) {
        io.to(socket.data.room).emit("message", data);
      }
    });

    // WebRTC Signaling
    socket.on("offer", (data) => {
      console.log(`🎥 [OFFER] from ${socket.data.username} in room ${socket.data.room}`);
      socket.to(socket.data.room).emit("offer", data);
    });

    socket.on("answer", (data) => {
      console.log(`✅ [ANSWER] from ${socket.data.username} in room ${socket.data.room}`);
      socket.to(socket.data.room).emit("answer", data);
    });

    socket.on("ice-candidate", (data) => {
      console.log(`🧊 [ICE] from ${socket.data.username} in room ${socket.data.room}`);
      socket.to(socket.data.room).emit("ice-candidate", data);
    });

    socket.on("disconnect", () => {
      console.log(`[${new Date().toISOString()}] Client disconnected: ${socket.id}`);
      if (socket.data.username && socket.data.room) {
        socket.to(socket.data.room).emit("message", {
          user: "System",
          text: `${socket.data.username} has left the room`,
          isSystem: true,
          timestamp: new Date().toISOString()
        });
      }

      setTimeout(() => {
        const rooms = getActiveRooms();
        console.log(`Broadcasting room list after disconnect:`, rooms);
        io.emit("room-list", rooms);
      }, 100);
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
}).catch((err) => {
  console.error("Error preparing Next.js app:", err);
  process.exit(1);
});
