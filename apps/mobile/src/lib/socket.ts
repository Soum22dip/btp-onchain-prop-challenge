import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(token: string): Socket {
  if (socket?.connected) return socket;
  socket = io(process.env.EXPO_PUBLIC_WS_URL ?? 'ws://10.145.35.81:3001', {
    query: { token },
    transports: ['websocket'],
    reconnectionAttempts: 5,
    autoConnect: true,
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
