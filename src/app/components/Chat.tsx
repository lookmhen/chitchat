"use client";
import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import EmojiPicker, { EmojiClickData, Theme as EmojiTheme } from 'emoji-picker-react';

interface Message {
    id?: string;
    user: string;
    text?: string;
    type?: 'text' | 'image' | 'audio' | 'gif';
    audio?: string;
    gif?: string;
    isSystem?: boolean;
    timestamp?: string;
    reactions?: { [emoji: string]: string[] };
}

interface ChatProps {
    username: string;
    room: string;
    onLeave: () => void;
}

const themes = {
    pink: {
        name: 'Pink',
        bg: 'bg-pink-50',
        header: 'bg-blue-200/80 border-blue-300',
        title: 'text-blue-800',
        myMsg: 'bg-green-200 text-green-900',
        otherMsg: 'bg-white text-gray-800',
        button: 'bg-blue-400 hover:bg-blue-500',
        ring: 'focus:ring-blue-300',
        color: 'bg-pink-400'
    },
    blue: {
        name: 'Blue',
        bg: 'bg-blue-50',
        header: 'bg-indigo-200/80 border-indigo-300',
        title: 'text-indigo-900',
        myMsg: 'bg-blue-200 text-blue-900',
        otherMsg: 'bg-white text-gray-800',
        button: 'bg-indigo-500 hover:bg-indigo-600',
        ring: 'focus:ring-indigo-300',
        color: 'bg-blue-400'
    },
    green: {
        name: 'Green',
        bg: 'bg-green-50',
        header: 'bg-emerald-200/80 border-emerald-300',
        title: 'text-emerald-900',
        myMsg: 'bg-emerald-200 text-emerald-900',
        otherMsg: 'bg-white text-gray-800',
        button: 'bg-emerald-500 hover:bg-emerald-600',
        ring: 'focus:ring-emerald-300',
        color: 'bg-green-400'
    },
    purple: {
        name: 'Purple',
        bg: 'bg-purple-50',
        header: 'bg-fuchsia-200/80 border-fuchsia-300',
        title: 'text-fuchsia-900',
        myMsg: 'bg-purple-200 text-purple-900',
        otherMsg: 'bg-white text-gray-800',
        button: 'bg-purple-500 hover:bg-purple-600',
        ring: 'focus:ring-purple-300',
        color: 'bg-purple-400'
    },
    orange: {
        name: 'Orange',
        bg: 'bg-orange-50',
        header: 'bg-amber-200/80 border-amber-300',
        title: 'text-amber-900',
        myMsg: 'bg-orange-200 text-orange-900',
        otherMsg: 'bg-white text-gray-800',
        button: 'bg-orange-500 hover:bg-orange-600',
        ring: 'focus:ring-orange-300',
        color: 'bg-orange-400'
    }
};

type ThemeKey = keyof typeof themes;

const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export default function Chat({ username, room, onLeave }: ChatProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const [showGif, setShowGif] = useState(false);
    const [gifs, setGifs] = useState<any[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [isInCall, setIsInCall] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [hasRemoteStream, setHasRemoteStream] = useState(false);
    const [currentTheme, setCurrentTheme] = useState<ThemeKey>('pink');
    const [users, setUsers] = useState<string[]>([]);
    const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
    const [showUserList, setShowUserList] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const remoteVideoRef = useRef<HTMLVideoElement>(null!);
    const localVideoRef = useRef<HTMLVideoElement>(null!);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteStreamRef = useRef<MediaStream | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const isScreenSharingRef = useRef(false);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const theme = themes[currentTheme];

    useEffect(() => {
        socketRef.current = io('http://localhost:3001');

        socketRef.current.on('connect', () => {
            socketRef.current?.emit('join', { username, room });
        });

        socketRef.current.on('message', (msg: Message) => {
            setMessages((prev) => [...prev, msg]);
        });

        socketRef.current.on('offer', async (offer) => {
            if (!peerConnectionRef.current) {
                peerConnectionRef.current = createPeerConnection();
            }
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            socketRef.current?.emit('answer', answer);
        });

        socketRef.current.on('answer', async (answer) => {
            if (peerConnectionRef.current) {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
            }
        });

        socketRef.current.on('ice-candidate', async (candidate) => {
            if (candidate && peerConnectionRef.current) {
                try {
                    await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (err) {
                    console.error("Error adding ICE candidate:", err);
                }
            }
        });

        socketRef.current.on('peer-joined', async ({ username: newPeerUsername }) => {
            if (isScreenSharingRef.current && localStreamRef.current && peerConnectionRef.current) {
                try {
                    const offer = await peerConnectionRef.current.createOffer({ iceRestart: true });
                    await peerConnectionRef.current.setLocalDescription(offer);
                    socketRef.current?.emit('offer', offer);
                } catch (err) {
                    console.error("Error creating offer for new peer:", err);
                }
            }
        });

        socketRef.current.on('room-users', (roomUsers: string[]) => {
            setUsers(roomUsers);
        });

        socketRef.current.on('typing', ({ username: typist }) => {
            setTypingUsers(prev => {
                const newSet = new Set(prev);
                newSet.add(typist);
                return newSet;
            });
        });

        socketRef.current.on('stop-typing', ({ username: typist }) => {
            setTypingUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(typist);
                return newSet;
            });
        });

        socketRef.current.on('reaction-update', ({ messageId, emoji, username: reactor }) => {
            setMessages(prevMessages => prevMessages.map(msg => {
                if (msg.id === messageId) {
                    const newReactions = { ...msg.reactions };
                    if (!newReactions[emoji]) newReactions[emoji] = [];

                    if (newReactions[emoji].includes(reactor)) {
                        newReactions[emoji] = newReactions[emoji].filter(u => u !== reactor);
                        if (newReactions[emoji].length === 0) delete newReactions[emoji];
                    } else {
                        newReactions[emoji].push(reactor);
                    }
                    return { ...msg, reactions: newReactions };
                }
                return msg;
            }));
        });

        return () => {
            socketRef.current?.disconnect();
            if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop());
            if (peerConnectionRef.current) peerConnectionRef.current.close();
        };
    }, [username, room]);

    useEffect(() => {
        if (hasRemoteStream && remoteVideoRef.current && remoteStreamRef.current) {
            remoteVideoRef.current.srcObject = remoteStreamRef.current;
            remoteVideoRef.current.play().catch(err => console.error("Error playing remote video:", err));
        }
    }, [hasRemoteStream]);

    useEffect(() => {
        isScreenSharingRef.current = isScreenSharing;
    }, [isScreenSharing]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, typingUsers]);

    const createPeerConnection = () => {
        const pc = new RTCPeerConnection(rtcConfig);
        peerConnectionRef.current = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate) socketRef.current?.emit('ice-candidate', event.candidate);
        };

        pc.ontrack = (event) => {
            if (event.streams[0]) {
                remoteStreamRef.current = event.streams[0];
                setHasRemoteStream(true);
            }
        };

        return pc;
    };

    const startCall = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;
            setIsInCall(true);

            const pc = createPeerConnection();
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socketRef.current?.emit('offer', offer);
        } catch (err) {
            console.error("Error starting call:", err);
            alert("Could not access microphone.");
        }
    };

    const startScreenShare = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

            localStreamRef.current = stream;
            setIsScreenSharing(true);

            setTimeout(() => {
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                    localVideoRef.current.play().catch(err => {
                        console.error("Error playing local video:", err);
                    });
                }
            }, 100);

            stream.getVideoTracks()[0].onended = () => {
                stopScreenShare();
            };

            const pc = createPeerConnection();
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socketRef.current?.emit('offer', offer);
        } catch (err) {
            console.error("Error sharing screen:", err);
            setIsScreenSharing(false);
        }
    };

    const stopCall = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        remoteStreamRef.current = null;
        setIsInCall(false);
        setHasRemoteStream(false);
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    };

    const stopScreenShare = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        remoteStreamRef.current = null;
        setIsScreenSharing(false);
        setHasRemoteStream(false);
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    };

    const toggleFullscreen = (videoRef: React.RefObject<HTMLVideoElement | null>) => {
        if (videoRef.current) {
            if (!document.fullscreenElement) {
                videoRef.current.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        }
    };

    const handleTyping = () => {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        socketRef.current?.emit('typing');
        typingTimeoutRef.current = setTimeout(() => {
            socketRef.current?.emit('stop-typing');
        }, 2000);
    };

    const handleReaction = (messageId: string, emoji: string) => {
        socketRef.current?.emit('reaction', { messageId, emoji, username });
    };

    const sendMessage = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (input.trim()) {
            const msg: Message = {
                id: crypto.randomUUID(),
                user: username,
                text: input,
                type: 'text',
                timestamp: new Date().toISOString(),
                reactions: {}
            };
            socketRef.current?.emit('message', msg);
            socketRef.current?.emit('stop-typing');
            setInput('');
            setShowEmoji(false);
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                audioChunksRef.current.push(event.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64Audio = reader.result as string;
                    const msg: Message = {
                        id: crypto.randomUUID(),
                        user: username,
                        type: 'audio',
                        audio: base64Audio,
                        timestamp: new Date().toISOString(),
                        reactions: {}
                    };
                    socketRef.current?.emit('message', msg);
                };
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Error recording audio:", err);
            alert("Could not access microphone.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const onEmojiClick = (emojiData: EmojiClickData) => {
        setInput((prev) => prev + emojiData.emoji);
    };

    const fetchGifs = async (searchTerm: string = '') => {
        const apiKey = 'sXpGFDGZs0Dv1mmNFvYaGUvYwKX0PWIh';
        const limit = 20;
        const url = searchTerm
            ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(searchTerm)}&limit=${limit}&rating=g`
            : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=${limit}&rating=g`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            setGifs(data.data || []);
        } catch (err) {
            console.error("Error fetching GIFs:", err);
            setGifs([]);
        }
    };

    const sendGif = (gifUrl: string) => {
        const msg: Message = {
            id: crypto.randomUUID(),
            user: username,
            type: 'gif',
            gif: gifUrl,
            timestamp: new Date().toISOString(),
            reactions: {}
        };
        socketRef.current?.emit('message', msg);
        setShowGif(false);
    };

    const handleLeave = () => {
        if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop());
        if (peerConnectionRef.current) peerConnectionRef.current.close();
        socketRef.current?.disconnect();
        onLeave();
    };

    return (
        <div className={`flex flex-col h-screen ${theme.bg} text-gray-800 transition-colors duration-500`}>
            <header className={`p-4 ${theme.header} backdrop-blur-md border-b flex justify-between items-center sticky top-0 z-10 shadow-sm transition-colors duration-500`}>
                <div className="flex flex-col">
                    <h1 className={`text-xl font-bold ${theme.title}`}>
                        {room} <span className="text-sm font-normal opacity-70">({username})</span>
                    </h1>
                    <div className="flex gap-2 mt-1">
                        {(Object.keys(themes) as ThemeKey[]).map((t) => (
                            <button
                                key={t}
                                onClick={() => setCurrentTheme(t)}
                                className={`w-4 h-4 rounded-full ${themes[t].color} border border-white/50 shadow-sm hover:scale-125 transition-transform ${currentTheme === t ? 'ring-2 ring-white' : ''}`}
                                title={themes[t].name}
                            />
                        ))}
                    </div>
                </div>
                <div className="flex gap-2 items-center">
                    <button
                        onClick={() => setShowUserList(!showUserList)}
                        className="px-3 py-1 bg-white/50 hover:bg-white/80 text-gray-800 rounded-full text-sm font-semibold transition-colors mr-2"
                    >
                        👥 {users.length}
                    </button>

                    {!isInCall && !isScreenSharing && (
                        <>
                            <button onClick={startCall} className="px-3 py-1 bg-green-300 hover:bg-green-400 text-green-900 rounded-full text-sm font-semibold transition-colors">
                                Join Voice
                            </button>
                            <button onClick={startScreenShare} className="px-3 py-1 bg-purple-300 hover:bg-purple-400 text-purple-900 rounded-full text-sm font-semibold transition-colors">
                                Share Screen
                            </button>
                        </>
                    )}
                    {isInCall && (
                        <button onClick={stopCall} className="px-3 py-1 bg-red-400 hover:bg-red-500 text-white rounded-full text-sm font-semibold transition-colors">
                            Stop Voice
                        </button>
                    )}
                    {isScreenSharing && (
                        <button onClick={stopScreenShare} className="px-3 py-1 bg-red-400 hover:bg-red-500 text-white rounded-full text-sm font-semibold transition-colors">
                            Stop Sharing
                        </button>
                    )}
                    <button onClick={handleLeave} className="px-3 py-1 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-full text-sm font-semibold transition-colors">
                        Leave Room
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* User List Sidebar */}
                {showUserList && (
                    <div className="w-64 bg-white/90 backdrop-blur-sm border-r border-gray-200 p-4 overflow-y-auto transition-all">
                        <h3 className="font-bold text-gray-700 mb-3">Online Users ({users.length})</h3>
                        <ul className="space-y-2">
                            {users.map((u, i) => (
                                <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                    {u} {u === username && '(You)'}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="flex-1 flex flex-col overflow-hidden">
                    {(isInCall || isScreenSharing || hasRemoteStream) && (
                        <div className="flex flex-col gap-4 p-4 bg-gray-900/95 shrink-0">
                            <div className="max-w-6xl mx-auto w-full">
                                <div className="mb-4 relative">
                                    <p className="text-white text-sm mb-2">Remote User:</p>
                                    <video
                                        ref={remoteVideoRef}
                                        autoPlay
                                        playsInline
                                        className="w-full max-h-[40vh] rounded-lg shadow-2xl border-2 border-green-400 bg-black"
                                    />
                                    <button
                                        onClick={() => toggleFullscreen(remoteVideoRef)}
                                        className="absolute top-10 right-2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                                        </svg>
                                    </button>
                                </div>

                                {isScreenSharing && (
                                    <div className="relative">
                                        <p className="text-white text-sm mb-2">Your Screen (Preview):</p>
                                        <video
                                            ref={localVideoRef}
                                            autoPlay
                                            muted
                                            playsInline
                                            className="w-full max-h-[20vh] rounded-lg shadow-2xl border-2 border-purple-400 bg-black"
                                        />
                                        <button
                                            onClick={() => toggleFullscreen(localVideoRef)}
                                            className="absolute top-10 right-2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                                            </svg>
                                        </button>
                                    </div>
                                )}

                                {isInCall && !isScreenSharing && !hasRemoteStream && (
                                    <div className="text-center p-4">
                                        <p className="text-white text-lg">🎤 Voice call active</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto w-full">
                        {messages.map((msg, idx) => (
                            <div
                                key={idx}
                                className={`flex flex-col ${msg.isSystem ? 'items-center' : msg.user === username ? 'items-end' : 'items-start'}`}
                            >
                                {msg.isSystem ? (
                                    <span className="text-xs text-gray-500 bg-gray-200/50 px-3 py-1 rounded-full">
                                        {msg.text}
                                    </span>
                                ) : (
                                    <div className="relative group max-w-[85%] md:max-w-[70%]">
                                        <div
                                            className={`rounded-2xl px-5 py-3 shadow-sm ${msg.user === username
                                                ? `${theme.myMsg} rounded-tr-none`
                                                : `${theme.otherMsg} border border-gray-100 rounded-tl-none`
                                                }`}
                                        >
                                            {!msg.isSystem && msg.user !== username && (
                                                <p className="text-sm font-bold mb-1 opacity-70">{msg.user}</p>
                                            )}

                                            {msg.type === 'audio' ? (
                                                <audio controls src={msg.audio} className="mt-1" />
                                            ) : msg.type === 'gif' ? (
                                                <img src={msg.gif} alt="GIF" className="max-w-full rounded-lg" />
                                            ) : (
                                                <p className="break-words text-base leading-relaxed">{msg.text}</p>
                                            )}

                                            <p className="text-xs mt-1.5 text-right opacity-60">
                                                {new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>

                                        {/* Reactions Display */}
                                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                            <div className={`flex gap-1 mt-1 ${msg.user === username ? 'justify-end' : 'justify-start'}`}>
                                                {Object.entries(msg.reactions).map(([emoji, users]) => (
                                                    <button
                                                        key={emoji}
                                                        onClick={() => msg.id && handleReaction(msg.id, emoji)}
                                                        className={`text-xs px-2 py-1 rounded-full border border-gray-200 bg-white hover:bg-gray-50 transition-colors ${users.includes(username) ? 'bg-blue-50 border-blue-200' : ''}`}
                                                        title={users.join(', ')}
                                                    >
                                                        {emoji} {users.length}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Reaction Buttons (Hover) */}
                                        {!msg.isSystem && (
                                            <div className={`absolute top-0 ${msg.user === username ? '-left-20' : '-right-20'} opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white shadow-md rounded-full p-1`}>
                                                {['👍', '❤️', '😂', '😮'].map(emoji => (
                                                    <button
                                                        key={emoji}
                                                        onClick={() => msg.id && handleReaction(msg.id, emoji)}
                                                        className="hover:scale-125 transition-transform p-1"
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Typing Indicator */}
                        {typingUsers.size > 0 && (
                            <div className="text-xs text-gray-500 italic ml-4 animate-pulse">
                                {Array.from(typingUsers).join(', ')} is typing...
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                </div>
            </div>

            <div className="p-4 bg-white/80 backdrop-blur-md border-t border-gray-200">
                <div className="max-w-3xl mx-auto flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowEmoji(!showEmoji)}
                        className="p-3 text-gray-400 hover:text-yellow-400 transition-colors rounded-full hover:bg-gray-100"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
                        </svg>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setShowGif(!showGif);
                            if (!showGif) fetchGifs();
                        }}
                        className="p-3 text-gray-400 hover:text-pink-400 transition-colors rounded-full hover:bg-gray-100"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                    </button>

                    {showEmoji && (
                        <div className="absolute bottom-24 left-4 z-20 shadow-xl rounded-xl overflow-hidden border border-gray-200">
                            <EmojiPicker onEmojiClick={onEmojiClick} theme={EmojiTheme.LIGHT} width={300} height={400} />
                        </div>
                    )}

                    {showGif && (
                        <div className="absolute bottom-24 left-4 z-20 w-96 h-96 bg-white shadow-2xl rounded-xl overflow-hidden border border-gray-200">
                            <div className="p-3 border-b">
                                <input
                                    type="text"
                                    placeholder="Search GIFs..."
                                    onChange={(e) => fetchGifs(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2 p-3 overflow-y-auto h-80">
                                {gifs.length > 0 ? gifs.map((gif) => (
                                    <img
                                        key={gif.id}
                                        src={gif.images.fixed_height_small.url}
                                        alt={gif.title}
                                        onClick={() => sendGif(gif.images.original.url)}
                                        className="w-full h-32 object-cover rounded-lg cursor-pointer hover:scale-105 transition-transform"
                                    />
                                )) : (
                                    <p className="col-span-2 text-center text-gray-500 p-4">Loading GIFs...</p>
                                )}
                            </div>
                        </div>
                    )}

                    <input
                        type="text"
                        value={input}
                        onChange={(e) => {
                            setInput(e.target.value);
                            handleTyping();
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder="Type a message..."
                        className={`flex-1 bg-gray-100 border border-gray-200 text-gray-800 rounded-full px-6 py-3 focus:outline-none focus:ring-2 ${theme.ring} focus:border-transparent placeholder-gray-400 shadow-inner`}
                    />

                    <button
                        type="button"
                        onMouseDown={startRecording}
                        onMouseUp={stopRecording}
                        onMouseLeave={stopRecording}
                        className={`p-3 rounded-full shadow-lg transition-all ${isRecording ? 'bg-red-500 text-white scale-110' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                        </svg>
                    </button>

                    <button
                        onClick={() => sendMessage()}
                        disabled={!input.trim()}
                        className={`p-3 ${theme.button} text-white rounded-full shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}
