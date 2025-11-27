"use client";
import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

interface LoginProps {
    onJoin: (username: string, room: string, password?: string) => void;
}

interface RoomInfo {
    name: string;
    userCount: number;
    isPrivate: boolean;
}

let socket: Socket;

export default function Login({ onJoin }: LoginProps) {
    const [username, setUsername] = useState('');
    const [room, setRoom] = useState('');
    const [password, setPassword] = useState('');
    const [activeRooms, setActiveRooms] = useState<RoomInfo[]>([]);
    const [showPasswordInput, setShowPasswordInput] = useState(false);
    const [showPrivateModal, setShowPrivateModal] = useState(false);
    const [selectedPrivateRoom, setSelectedPrivateRoom] = useState('');
    const [isWaitingApproval, setIsWaitingApproval] = useState(false);
    const [modalPassword, setModalPassword] = useState('');

    useEffect(() => {
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || `http://${window.location.hostname}:${process.env.NEXT_PUBLIC_SOCKET_PORT || 3001}`;
        socket = io(socketUrl);

        socket.on('connect', () => {
            console.log('Connected to Socket.IO server');
            socket.emit('get-rooms');
        });

        socket.on('room-list', (rooms: RoomInfo[]) => {
            console.log("Received room list:", rooms);
            setActiveRooms(rooms);
        });

        socket.on('join-request-pending', () => {
            setIsWaitingApproval(true);
        });

        socket.on('request-approved', ({ room }) => {
            setIsWaitingApproval(false);
            setShowPrivateModal(false);
            onJoin(username, room); // Join without password (approved)
        });

        socket.on('join-error', (msg) => {
            alert(msg);
            setIsWaitingApproval(false);
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
    }, [username, onJoin]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedUsername = username.trim();
        const trimmedRoom = room.trim();

        if (trimmedUsername && trimmedRoom) {
            // Check if room is private and no password entered
            const roomInfo = activeRooms.find(r => r.name === trimmedRoom);
            if (roomInfo?.isPrivate && !password) {
                setSelectedPrivateRoom(trimmedRoom);
                setShowPrivateModal(true);
                return;
            }
            onJoin(trimmedUsername, trimmedRoom, password);
        }
    };

    const handlePrivateJoin = () => {
        console.log(`[CLIENT] Joining private room: '${selectedPrivateRoom}' with password: '${modalPassword}'`);
        onJoin(username.trim(), selectedPrivateRoom, modalPassword);
    };

    const handleRequestAccess = () => {
        socket.emit('join-request', { username: username.trim(), room: selectedPrivateRoom });
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
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="createPrivate"
                                checked={showPasswordInput}
                                onChange={(e) => {
                                    setShowPasswordInput(e.target.checked);
                                    if (!e.target.checked) setPassword('');
                                }}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                            />
                            <label htmlFor="createPrivate" className="text-sm text-gray-600 select-none cursor-pointer">
                                Create Private Room (Set Password)
                            </label>
                        </div>

                        {showPasswordInput && (
                            <div className="animate-in slide-in-from-top-2 duration-200">
                                <label htmlFor="password" className="block text-sm font-medium text-gray-600 mb-2">
                                    Password
                                </label>
                                <input
                                    type="password"
                                    id="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-white/50 border border-purple-200 rounded-2xl focus:ring-2 focus:ring-purple-300 focus:border-transparent outline-none transition-all placeholder-gray-400 text-gray-700"
                                    placeholder="Set a password..."
                                />
                            </div>
                        )}
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
                                    key={r.name}
                                    onClick={() => {
                                        setRoom(r.name);
                                        if (r.isPrivate) {
                                            if (username.trim()) {
                                                setSelectedPrivateRoom(r.name);
                                                setShowPrivateModal(true);
                                            } else {
                                                document.getElementById('username')?.focus();
                                            }
                                        }
                                    }}
                                    className="w-full text-left p-4 bg-white/60 hover:bg-white/90 rounded-2xl transition-all shadow-sm hover:shadow-md group border border-transparent hover:border-blue-200"
                                >
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-gray-700 group-hover:text-blue-600">{r.name}</span>
                                            {r.isPrivate && <span title="Private Room">🔒</span>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500">👤 {r.userCount}</span>
                                            <span className="text-xs text-blue-400 bg-blue-50 px-2 py-1 rounded-full group-hover:bg-blue-100">Join</span>
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Private Room Modal */}
                {showPrivateModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
                            <h3 className="text-2xl font-bold mb-4 text-gray-800 flex items-center gap-2">
                                🔒 Private Room: {selectedPrivateRoom}
                            </h3>

                            {!isWaitingApproval ? (
                                <>
                                    <p className="text-gray-600 mb-6">This room is locked. Enter the password or request access from members.</p>

                                    <div className="space-y-4">
                                        <input
                                            type="password"
                                            value={modalPassword}
                                            onChange={(e) => setModalPassword(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-300 outline-none"
                                            placeholder="Enter password..."
                                        />

                                        <button
                                            onClick={handlePrivateJoin}
                                            className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold transition-colors"
                                        >
                                            Join with Password
                                        </button>

                                        <div className="relative flex py-2 items-center">
                                            <div className="flex-grow border-t border-gray-200"></div>
                                            <span className="flex-shrink mx-4 text-gray-400 text-sm">OR</span>
                                            <div className="flex-grow border-t border-gray-200"></div>
                                        </div>

                                        <button
                                            onClick={handleRequestAccess}
                                            className="w-full py-3 bg-white border-2 border-blue-500 text-blue-500 hover:bg-blue-50 rounded-xl font-bold transition-colors"
                                        >
                                            Request Access
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-8">
                                    <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
                                    <h4 className="text-xl font-bold text-gray-800 mb-2">Waiting for Approval...</h4>
                                    <p className="text-gray-500">Please wait while a room member reviews your request.</p>
                                </div>
                            )}

                            <button
                                onClick={() => {
                                    setShowPrivateModal(false);
                                    setIsWaitingApproval(false);
                                    setModalPassword('');
                                }}
                                className="mt-6 w-full py-2 text-gray-400 hover:text-gray-600 font-medium"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
