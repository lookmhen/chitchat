"use client";
import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSearchParams } from 'next/navigation';

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
    const searchParams = useSearchParams();
    const [username, setUsername] = useState('');
    const [room, setRoom] = useState(decodeURIComponent(searchParams.get('room') || '').trim());
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

    const isInviteMode = !!searchParams.get('room');

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-100 via-green-100 to-pink-100 p-4">
            <div className={`w-full ${isInviteMode ? 'max-w-md' : 'max-w-4xl grid md:grid-cols-2 gap-8'} transition-all duration-500`}>

                {/* Login Form Section */}
                <div className="p-8 bg-white/60 backdrop-blur-xl rounded-3xl shadow-xl border border-white/50 animate-fadeIn h-fit">
                    <div className="text-center mb-8">
                        <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-pink-600 mb-2">
                            {isInviteMode ? 'Join Chat' : 'ChitChat'}
                        </h1>
                        <p className="text-gray-600">
                            {isInviteMode ? (
                                <>
                                    You've been invited to join <span className="font-bold text-blue-600">{room}</span>
                                </>
                            ) : (
                                'Enter a room name to start chatting!'
                            )}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all bg-white/50 backdrop-blur-sm"
                                placeholder="Enter your name"
                                required
                            />
                        </div>

                        {!isInviteMode && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Room Name</label>
                                <input
                                    type="text"
                                    value={room}
                                    onChange={(e) => setRoom(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all bg-white/50 backdrop-blur-sm"
                                    placeholder="e.g., general"
                                    required
                                />
                            </div>
                        )}

                        {/* Password field - show if room is private OR if user manually toggles it */}
                        {(showPasswordInput || (isInviteMode && activeRooms.find(r => r.name === room)?.isPrivate)) && (
                            <div className="animate-slideDown">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Room Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all bg-white/50 backdrop-blur-sm"
                                    placeholder="Enter password"
                                />
                            </div>
                        )}

                        {!isInviteMode && !showPasswordInput && (
                            <button
                                type="button"
                                onClick={() => setShowPasswordInput(true)}
                                className="text-sm text-gray-500 hover:text-gray-700 underline"
                            >
                                Join private room?
                            </button>
                        )}

                        <button
                            type="submit"
                            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-pink-500 text-white font-bold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
                        >
                            {isInviteMode ? 'Join Now' : 'Enter Room'}
                        </button>
                    </form>
                </div>

                {/* Active Rooms List (Only show in non-invite mode) */}
                {!isInviteMode && (
                    <div className="p-8 bg-white/40 backdrop-blur-md rounded-3xl border border-white/30 hidden md:flex flex-col animate-fadeIn h-[500px]">
                        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                            <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                            Active Rooms
                        </h2>

                        {activeRooms.length === 0 ? (
                            <div className="text-center text-gray-500 py-12 flex-1 flex flex-col justify-center">
                                <p>No active rooms yet.</p>
                                <p className="text-sm mt-2">Be the first to create one!</p>
                            </div>
                        ) : (
                            <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
                                {activeRooms.map((r) => (
                                    <button
                                        key={r.name}
                                        onClick={() => setRoom(r.name)}
                                        className={`w-full text-left p-4 rounded-2xl transition-all flex items-center justify-between group ${room === r.name ? 'bg-white shadow-lg ring-2 ring-blue-400' : 'bg-white/50 hover:bg-white hover:shadow-md'}`}
                                    >
                                        <div className="min-w-0 flex-1 mr-2">
                                            <div className="font-bold text-gray-800 flex items-center gap-2">
                                                <span className="truncate">{r.name}</span>
                                                {r.isPrivate && (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-purple-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                                    </svg>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                {r.userCount} user{r.userCount !== 1 && 's'} online
                                            </div>
                                        </div>
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${room === r.name ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-400 group-hover:bg-blue-100 group-hover:text-blue-500'}`}>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Private Room Modal */}
            {showPrivateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md animate-scaleIn">
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            Private Room: {selectedPrivateRoom}
                        </h3>

                        {!isWaitingApproval ? (
                            <>
                                <p className="text-gray-600 mb-6">This room is private. You can either enter the password or request access from the room owner.</p>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Enter Password</label>
                                        <input
                                            type="password"
                                            value={modalPassword}
                                            onChange={(e) => setModalPassword(e.target.value)}
                                            className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-purple-400 transition-all"
                                            placeholder="Room password"
                                        />
                                    </div>

                                    <button
                                        onClick={handlePrivateJoin}
                                        className="w-full py-2.5 rounded-xl bg-purple-600 text-white font-bold hover:bg-purple-700 transition-colors"
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
                                        className="w-full py-2.5 rounded-xl border-2 border-purple-600 text-purple-600 font-bold hover:bg-purple-50 transition-colors"
                                    >
                                        Request Access
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-8">
                                <div className="w-16 h-16 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-4"></div>
                                <h4 className="text-lg font-bold text-gray-800 mb-2">Waiting for Approval...</h4>
                                <p className="text-gray-500">Please wait while the room owner reviews your request.</p>
                            </div>
                        )}

                        <button
                            onClick={() => {
                                setShowPrivateModal(false);
                                setIsWaitingApproval(false);
                                setModalPassword('');
                            }}
                            className="mt-6 w-full py-2 text-gray-500 hover:text-gray-700 font-medium"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
