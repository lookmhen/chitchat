"use client";
import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

interface LoginProps {
    onJoin: (username: string, room: string) => void;
}

let socket: Socket;

export default function Login({ onJoin }: LoginProps) {
    const [username, setUsername] = useState('');
    const [room, setRoom] = useState('');
    const [activeRooms, setActiveRooms] = useState<string[]>([]);

    useEffect(() => {
        socket = io('http://localhost:3001');

        socket.on('connect', () => {
            console.log('Connected to Socket.IO server');
            socket.emit('get-rooms');
        });

        socket.on('room-list', (rooms: string[]) => {
            console.log("Received room list:", rooms);
            setActiveRooms(rooms);
        });

        const interval = setInterval(() => {
            if (socket.connected) {
                socket.emit('get-rooms');
            }
        }, 5000);

        return () => {
            clearInterval(interval);
            socket.disconnect();
        };
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (username.trim() && room.trim()) {
            onJoin(username, room);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-100 via-green-100 to-pink-100 p-4">
            <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8">

                {/* Login Form */}
                <div className="p-8 bg-white/60 backdrop-blur-xl rounded-3xl shadow-xl border border-white/50">
                    <h1 className="text-4xl font-bold text-center mb-8 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-pink-400">
                        Chitchat
                    </h1>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="username" className="block text-sm font-medium text-gray-600 mb-2">
                                Choose your alias
                            </label>
                            <input
                                type="text"
                                id="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-4 py-3 bg-white/50 border border-blue-200 rounded-2xl focus:ring-2 focus:ring-pink-300 focus:border-transparent outline-none transition-all placeholder-gray-400 text-gray-700"
                                placeholder="Enter username..."
                                autoFocus
                            />
                        </div>
                        <div>
                            <label htmlFor="room" className="block text-sm font-medium text-gray-600 mb-2">
                                Room Name
                            </label>
                            <input
                                type="text"
                                id="room"
                                value={room}
                                onChange={(e) => setRoom(e.target.value)}
                                className="w-full px-4 py-3 bg-white/50 border border-green-200 rounded-2xl focus:ring-2 focus:ring-blue-300 focus:border-transparent outline-none transition-all placeholder-gray-400 text-gray-700"
                                placeholder="Enter room name..."
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={!username.trim() || !room.trim()}
                            className="w-full py-3 px-4 bg-gradient-to-r from-blue-400 to-pink-400 hover:from-blue-500 hover:to-pink-500 text-white rounded-2xl font-bold shadow-lg transform transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Join Room
                        </button>
                    </form>
                </div>

                {/* Active Rooms List */}
                <div className="p-8 bg-white/40 backdrop-blur-md rounded-3xl shadow-lg border border-white/30 flex flex-col">
                    <h2 className="text-2xl font-bold text-gray-700 mb-6 flex items-center gap-2">
                        <span className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></span>
                        Active Rooms ({activeRooms.length})
                    </h2>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-gray-300">
                        {activeRooms.length === 0 ? (
                            <p className="text-gray-500 text-center italic mt-10">No active rooms yet. Be the first!</p>
                        ) : (
                            activeRooms.map((r) => (
                                <button
                                    key={r}
                                    onClick={() => setRoom(r)}
                                    className="w-full text-left p-4 bg-white/60 hover:bg-white/90 rounded-2xl transition-all shadow-sm hover:shadow-md group border border-transparent hover:border-blue-200"
                                >
                                    <div className="flex justify-between items-center">
                                        <span className="font-semibold text-gray-700 group-hover:text-blue-600">{r}</span>
                                        <span className="text-xs text-blue-400 bg-blue-50 px-2 py-1 rounded-full group-hover:bg-blue-100">Join</span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
