"use client";
import { useState } from 'react';
import Login from './components/Login';
import Chat from './components/Chat';

export default function Home() {
  const [username, setUsername] = useState<string | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [password, setPassword] = useState<string | undefined>(undefined);

  const handleJoin = (user: string, roomName: string, pwd?: string) => {
    setUsername(user);
    setRoom(roomName);
    setPassword(pwd);
  };

  const handleLeave = () => {
    setUsername(null);
    setRoom(null);
    setPassword(undefined);
  };

  return (
    <main>
      {!username || !room ? (
        <Login onJoin={handleJoin} />
      ) : (
        <Chat username={username} room={room} password={password} onLeave={handleLeave} />
      )}
    </main>
  );
}
