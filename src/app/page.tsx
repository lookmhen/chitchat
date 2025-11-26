"use client";
import { useState } from 'react';
import Login from './components/Login';
import Chat from './components/Chat';

export default function Home() {
  const [username, setUsername] = useState<string | null>(null);
  const [room, setRoom] = useState<string | null>(null);

  const handleJoin = (user: string, roomName: string) => {
    setUsername(user);
    setRoom(roomName);
  };

  const handleLeave = () => {
    setUsername(null);
    setRoom(null);
  };

  return (
    <main>
      {!username || !room ? (
        <Login onJoin={handleJoin} />
      ) : (
        <Chat username={username} room={room} onLeave={handleLeave} />
      )}
    </main>
  );
}
