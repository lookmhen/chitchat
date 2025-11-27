"use client";
import React, { useState, useEffect, useRef } from 'react';
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
    image?: string;
    replyTo?: {
        id: string;
        user: string;
        text: string;
    };
}

interface ChatProps {
    username: string;
    room: string;
    password?: string;
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

export default function Chat({ username, room, password, onLeave }: ChatProps) {
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
    const [joinRequests, setJoinRequests] = useState<{ username: string; socketId: string }[]>([]);
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);

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
    const fileInputRef = useRef<HTMLInputElement>(null);

    const theme = themes[currentTheme];

    useEffect(() => {
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || `http://${window.location.hostname}:${process.env.NEXT_PUBLIC_SOCKET_PORT || 3001}`;
        socketRef.current = io(socketUrl);

        socketRef.current.on('connect', () => {
            socketRef.current?.emit('join', { username, room, password });
        });

        socketRef.current.on('message', (msg: Message) => {
            setMessages(prev => [...prev, msg]);
        });

        socketRef.current.on('message-history', (history: Message[]) => {
            setMessages(history);
        });

        // Join Request Listeners
        socketRef.current.on('join-request-received', ({ username: reqUser, socketId }) => {
            setJoinRequests(prev => [...prev, { username: reqUser, socketId }]);
        });

        socketRef.current.on('request-approved', ({ room: approvedRoom }) => {
            socketRef.current?.emit('join', { username, room: approvedRoom, password: '' });
        });

        // WebRTC Listeners
        socketRef.current.on('offer', async (offer) => {
            if (!peerConnectionRef.current) {
                createPeerConnection();
            }
            if (peerConnectionRef.current) {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await peerConnectionRef.current.createAnswer();
                await peerConnectionRef.current.setLocalDescription(answer);
                socketRef.current?.emit('answer', answer);
                setIsInCall(true);
            }
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
    }, [username, room, password]);

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
    }, [messages, typingUsers, replyingTo]);

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

    const handleApprove = (socketId: string) => {
        socketRef.current?.emit('approve-request', { socketId, room });
        setJoinRequests(prev => prev.filter(req => req.socketId !== socketId));
    };

    const handleDeny = (socketId: string) => {
        socketRef.current?.emit('deny-request', { socketId, room });
        setJoinRequests(prev => prev.filter(req => req.socketId !== socketId));
    };

    const generateUUID = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };

    const sendMessage = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (input.trim()) {
            const msg: Message = {
                id: generateUUID(),
                user: username,
                text: input,
                type: 'text',
                timestamp: new Date().toISOString(),
                reactions: {},
                replyTo: replyingTo ? {
                    id: replyingTo.id!,
                    user: replyingTo.user,
                    text: replyingTo.text || (replyingTo.type === 'image' ? 'Image' : replyingTo.type === 'audio' ? 'Audio' : 'GIF')
                } : undefined
            };
            socketRef.current?.emit('message', msg);
            socketRef.current?.emit('stop-typing');
            setInput('');
            setShowEmoji(false);
            setReplyingTo(null);
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
                        id: generateUUID(),
                        user: username,
                        type: 'audio',
                        audio: base64Audio,
                        timestamp: new Date().toISOString(),
                        reactions: {},
                        replyTo: replyingTo ? {
                            id: replyingTo.id!,
                            user: replyingTo.user,
                            text: replyingTo.text || (replyingTo.type === 'image' ? 'Image' : replyingTo.type === 'audio' ? 'Audio' : 'GIF')
                        } : undefined
                    };
                    socketRef.current?.emit('message', msg);
                    setReplyingTo(null);
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
            id: generateUUID(),
            user: username,
            type: 'gif',
            gif: gifUrl,
            timestamp: new Date().toISOString(),
            reactions: {},
            replyTo: replyingTo ? {
                id: replyingTo.id!,
                user: replyingTo.user,
                text: replyingTo.text || (replyingTo.type === 'image' ? 'Image' : replyingTo.type === 'audio' ? 'Audio' : 'GIF')
            } : undefined
        };
        socketRef.current?.emit('message', msg);
        setShowGif(false);
        setReplyingTo(null);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) { // 2MB limit
                alert("File size too large. Please select an image under 2MB.");
                return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
                const base64Image = reader.result as string;
                const msg: Message = {
                    id: generateUUID(),
                    user: username,
                    type: 'image',
                    image: base64Image,
                    timestamp: new Date().toISOString(),
                    reactions: {},
                    replyTo: replyingTo ? {
                        id: replyingTo.id!,
                        user: replyingTo.user,
                        text: replyingTo.text || (replyingTo.type === 'image' ? 'Image' : replyingTo.type === 'audio' ? 'Audio' : 'GIF')
                    } : undefined
                };
                socketRef.current?.emit('message', msg);
                setReplyingTo(null);
            };
            reader.readAsDataURL(file);
        }
    };

    const onEmojiClick = (emojiData: EmojiClickData) => {
        setInput((prev) => prev + emojiData.emoji);
    };

    const copyInviteLink = () => {
        const url = `${window.location.origin}?room=${encodeURIComponent(room)}`;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
                alert("Invite link copied to clipboard!");
            }).catch(err => {
                console.error('Failed to copy: ', err);
                fallbackCopyTextToClipboard(url);
            });
        } else {
            fallbackCopyTextToClipboard(url);
        }
    };

    const fallbackCopyTextToClipboard = (text: string) => {
        const textArea = document.createElement("textarea");
        textArea.value = text;

        // Avoid scrolling to bottom
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
            const msg = successful ? 'successful' : 'unsuccessful';
            if (successful) {
                alert("Invite link copied to clipboard!");
            } else {
                alert("Failed to copy link. Please copy manually: " + text);
            }
        } catch (err) {
            console.error('Fallback: Oops, unable to copy', err);
            alert("Failed to copy link. Please copy manually: " + text);
        }

        document.body.removeChild(textArea);
    };

    return (
        <div className={`flex h-screen ${theme.bg} transition-colors duration-300`}>
            {/* Sidebar */}
            <div className={`transition-all duration-300 ${showUserList ? 'w-64' : 'w-0'} overflow-hidden bg-white/80 backdrop-blur-md border-r border-white/20 shadow-lg`}>
                <div className="p-4">
                    <h3 className={`font-bold mb-4 ${theme.title}`}>Active Users ({users.length})</h3>
                    <ul className="space-y-2">
                        {users.map((user, index) => (
                            <li key={index} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/50 transition-colors">
                                <div className={`w-2 h-2 rounded-full ${user === username ? 'bg-green-500' : 'bg-gray-400'}`} />
                                <span className="text-gray-700 font-medium">{user} {user === username && '(You)'}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col relative">
                {/* Header */}
                <header className={`${theme.header} p-4 flex justify-between items-center shadow-sm backdrop-blur-md z-10`}>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setShowUserList(!showUserList)}
                            className={`p-2 rounded-full hover:bg-white/20 transition-colors ${theme.title}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                        </button>
                        <div>
                            <h1 className={`text-xl font-bold ${theme.title}`}>{room}</h1>
                            <p className="text-sm text-gray-600 flex items-center gap-2">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                {users.length} online
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Invite Link Button */}
                        <button
                            onClick={copyInviteLink}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/50 hover:bg-white/80 transition-colors text-sm font-medium text-gray-700 shadow-sm"
                            title="Copy Invite Link"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z" />
                                <path d="M3 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5zM15 11h2a1 1 0 110 2h-2v-2z" />
                            </svg>
                            <span>Invite</span>
                        </button>

                        {/* Theme Selector */}
                        <div className="flex gap-1 mr-4">
                            {(Object.keys(themes) as ThemeKey[]).map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setCurrentTheme(t)}
                                    className={`w-6 h-6 rounded-full border-2 ${currentTheme === t ? 'border-gray-600 scale-110' : 'border-transparent'} ${themes[t].color} transition-all`}
                                    title={themes[t].name}
                                />
                            ))}
                        </div>

                        {/* Call Controls */}
                        {!isInCall && !isScreenSharing && (
                            <>
                                <button onClick={startCall} className="p-2 rounded-full bg-green-500 text-white hover:bg-green-600 transition-all shadow-md hover:shadow-lg">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                                    </svg>
                                </button>
                                <button onClick={startScreenShare} className="p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-all shadow-md hover:shadow-lg">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.923 2.489a1 1 0 01-1.874.695L11.118 16H8.882l-.923 2.489a1 1 0 01-1.874-.695L6.995 16H4.78a2 2 0 01-2-2V5zm2 0v8h10V5H5z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </>
                        )}
                        {(isInCall || isScreenSharing) && (
                            <button onClick={isInCall ? stopCall : stopScreenShare} className="p-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition-all shadow-md hover:shadow-lg animate-pulse">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.923 2.489a1 1 0 01-1.874.695L11.118 16H8.882l-.923 2.489a1 1 0 01-1.874-.695L6.995 16H4.78a2 2 0 01-2-2V5zm2 0v8h10V5H5z" clipRule="evenodd" />
                                </svg>
                            </button>
                        )}

                        <button onClick={onLeave} className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-all shadow-md hover:shadow-lg font-medium">
                            Leave
                        </button>
                    </div>
                </header>

                {/* Join Requests Notification */}
                {joinRequests.length > 0 && (
                    <div className="bg-yellow-100 border-b border-yellow-200 p-3 animate-slideDown">
                        <div className="max-w-3xl mx-auto flex items-center justify-between">
                            <div className="flex items-center gap-2 text-yellow-800">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                </svg>
                                <span className="font-medium">Join Requests:</span>
                            </div>
                            <div className="flex gap-4">
                                {joinRequests.map((req) => (
                                    <div key={req.socketId} className="flex items-center gap-3 bg-white px-3 py-1 rounded-full shadow-sm">
                                        <span className="font-medium text-gray-700">{req.username}</span>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => handleApprove(req.socketId)}
                                                className="p-1 rounded-full bg-green-100 text-green-600 hover:bg-green-200 transition-colors"
                                                title="Approve"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => handleDeny(req.socketId)}
                                                className="p-1 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                                                title="Deny"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Video Area */}
                {(hasRemoteStream || isScreenSharing) && (
                    <div className="absolute top-20 right-4 w-64 md:w-80 bg-black rounded-xl overflow-hidden shadow-2xl z-20 transition-all hover:scale-105">
                        <div className="relative aspect-video bg-gray-900">
                            <video
                                ref={remoteVideoRef}
                                autoPlay
                                playsInline
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute bottom-2 right-2 flex gap-2">
                                <button
                                    onClick={() => toggleFullscreen(remoteVideoRef)}
                                    className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition-all"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        {isScreenSharing && (
                            <div className="absolute bottom-4 right-4 w-24 aspect-video bg-gray-800 rounded-lg overflow-hidden border-2 border-white/20 shadow-lg">
                                <video
                                    ref={localVideoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
                    {messages.map((msg, index) => {
                        const isMyMsg = msg.user === username;
                        const isSystem = msg.isSystem;

                        if (isSystem) {
                            return (
                                <div key={index} className="flex justify-center my-4">
                                    <span className="bg-gray-100 text-gray-500 text-xs px-3 py-1 rounded-full border border-gray-200">
                                        {msg.text}
                                    </span>
                                </div>
                            );
                        }

                        return (
                            <div key={index} className={`flex flex-col ${isMyMsg ? 'items-end' : 'items-start'} animate-fadeIn`}>
                                <div className="flex items-end gap-2 max-w-[80%]">
                                    {!isMyMsg && (
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm ${theme.button}`}>
                                            {msg.user.substring(0, 2).toUpperCase()}
                                        </div>
                                    )}
                                    <div className={`
                                        rounded-2xl px-4 py-2 shadow-sm relative group transition-all hover:shadow-md
                                        ${isMyMsg ? `${theme.myMsg} rounded-br-none` : `${theme.otherMsg} rounded-bl-none`}
                                    `}>
                                        {/* Username for other users */}
                                        {!isMyMsg && <p className={`text-xs font-bold mb-1 opacity-70 ${theme.title}`}>{msg.user}</p>}

                                        {/* Reply Context */}
                                        {msg.replyTo && (
                                            <div className="mb-2 p-2 rounded bg-black/5 border-l-4 border-gray-400 text-xs cursor-pointer hover:bg-black/10 transition-colors" onClick={() => {
                                                // Optional: Scroll to replied message
                                            }}>
                                                <p className="font-bold opacity-70">{msg.replyTo.user}</p>
                                                <p className="truncate opacity-60">{msg.replyTo.text}</p>
                                            </div>
                                        )}

                                        {/* Message Content */}
                                        {msg.type === 'text' && <p className="text-sm md:text-base leading-relaxed">{msg.text}</p>}
                                        {msg.type === 'image' && (
                                            <img src={msg.image} alt="Shared Image" className="rounded-lg max-w-[200px] md:max-w-xs cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(msg.image, '_blank')} />
                                        )}
                                        {msg.type === 'audio' && (
                                            <audio controls src={msg.audio} className="max-w-[200px] h-10" />
                                        )}
                                        {msg.type === 'gif' && (
                                            <img src={msg.gif} alt="GIF" className="rounded-lg max-w-[200px] md:max-w-xs" />
                                        )}

                                        {/* Timestamp */}
                                        <p className="text-[10px] opacity-50 mt-1 text-right">
                                            {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </p>

                                        {/* Reactions */}
                                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                            <div className="absolute -bottom-3 right-2 flex gap-1">
                                                {Object.entries(msg.reactions).map(([emoji, users]) => (
                                                    <div key={emoji} className="bg-white rounded-full px-1.5 py-0.5 text-xs shadow-sm border border-gray-100 flex items-center gap-1" title={users.join(', ')}>
                                                        <span>{emoji}</span>
                                                        <span className="text-gray-500 font-medium">{users.length}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Message Actions (Reply & React) */}
                                        <div className={`absolute top-0 ${isMyMsg ? '-left-16' : '-right-16'} opacity-0 group-hover:opacity-100 transition-opacity flex gap-1`}>
                                            <button
                                                onClick={() => setReplyingTo(msg)}
                                                className="p-1 rounded-full bg-white shadow-sm hover:bg-gray-50 text-gray-400 hover:text-blue-500 transition-colors"
                                                title="Reply"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => handleReaction(msg.id!, '❤️')}
                                                className="p-1 rounded-full bg-white shadow-sm hover:bg-gray-50 text-gray-400 hover:text-red-500 transition-colors"
                                                title="Like"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* Typing Indicator */}
                    {typingUsers.size > 0 && (
                        <div className="flex items-center gap-2 text-gray-500 text-xs ml-12 animate-pulse">
                            <div className="flex gap-1">
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                            </div>
                            <span>{Array.from(typingUsers).join(', ')} is typing...</span>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white/80 backdrop-blur-md border-t border-white/20">
                    {/* Reply Preview */}
                    {replyingTo && (
                        <div className="flex items-center justify-between bg-gray-100 p-2 rounded-t-lg border-b border-gray-200 mb-2 animate-slideUp">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <div className="w-1 h-8 bg-blue-500 rounded-full"></div>
                                <div className="flex flex-col text-xs">
                                    <span className="font-bold text-blue-600">Replying to {replyingTo.user}</span>
                                    <span className="text-gray-500 truncate max-w-xs">{replyingTo.text || (replyingTo.type === 'image' ? 'Image' : replyingTo.type === 'audio' ? 'Audio' : 'GIF')}</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setReplyingTo(null)}
                                className="p-1 hover:bg-gray-200 rounded-full text-gray-500"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>
                    )}

                    <form onSubmit={sendMessage} className="flex items-end gap-2 max-w-4xl mx-auto relative">
                        {/* Emoji Picker */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowEmoji(!showEmoji)}
                                className="p-2 text-gray-500 hover:text-yellow-500 transition-colors rounded-full hover:bg-gray-100"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </button>
                            {showEmoji && (
                                <div className="absolute bottom-12 left-0 z-50 shadow-xl rounded-2xl overflow-hidden animate-popIn">
                                    <EmojiPicker onEmojiClick={onEmojiClick} theme={EmojiTheme.LIGHT} />
                                </div>
                            )}
                        </div>

                        {/* GIF Picker */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowGif(!showGif);
                                    if (!showGif) fetchGifs();
                                }}
                                className="p-2 text-gray-500 hover:text-pink-500 transition-colors rounded-full hover:bg-gray-100"
                            >
                                <span className="font-bold text-xs border border-current rounded px-1">GIF</span>
                            </button>
                            {showGif && (
                                <div className="absolute bottom-12 left-0 z-50 w-64 h-80 bg-white rounded-xl shadow-xl border border-gray-100 flex flex-col overflow-hidden animate-popIn">
                                    <div className="p-2 border-b">
                                        <input
                                            type="text"
                                            placeholder="Search GIFs..."
                                            className="w-full px-3 py-1 rounded-lg bg-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                            onChange={(e) => fetchGifs(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2">
                                        {gifs.map((gif) => (
                                            <button
                                                key={gif.id}
                                                onClick={() => sendGif(gif.images.fixed_height.url)}
                                                className="hover:opacity-80 transition-opacity"
                                            >
                                                <img src={gif.images.fixed_height.url} alt={gif.title} className="w-full h-auto rounded-md" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Image Upload */}
                        <div className="relative">
                            <input
                                type="file"
                                accept="image/*"
                                ref={fileInputRef}
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="p-2 text-gray-500 hover:text-green-500 transition-colors rounded-full hover:bg-gray-100"
                                title="Upload Image"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </button>
                        </div>

                        {/* Audio Recording */}
                        <button
                            type="button"
                            onMouseDown={startRecording}
                            onMouseUp={stopRecording}
                            onMouseLeave={stopRecording}
                            className={`p-2 rounded-full transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse scale-110' : 'text-gray-500 hover:text-red-500 hover:bg-gray-100'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                        </button>

                        {/* Text Input */}
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={(e) => {
                                handleTyping();
                                if (e.key === 'Enter') sendMessage(e);
                            }}
                            placeholder="Type a message..."
                            className={`flex-1 px-4 py-3 rounded-xl border-0 bg-gray-100 focus:bg-white focus:ring-2 ${theme.ring} transition-all shadow-inner`}
                        />

                        {/* Send Button */}
                        <button
                            type="submit"
                            disabled={!input.trim()}
                            className={`p-3 rounded-xl text-white shadow-md transition-all ${input.trim() ? `${theme.button} hover:scale-105 active:scale-95` : 'bg-gray-300 cursor-not-allowed'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                            </svg>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
