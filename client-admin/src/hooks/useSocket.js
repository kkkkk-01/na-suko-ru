import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join', { user_id: 0, role: 'admin' });
    });

    socket.on('disconnect', () => setConnected(false));

    // リアルタイムイベント購読
    const eventTypes = [
      'notification:new',
      'call:incoming',
      'call:answered',
      'call:ended',
      'device:status',
      'system:status',
    ];

    eventTypes.forEach(eventType => {
      socket.on(eventType, (data) => {
        setEvents(prev => [{
          type: eventType,
          data,
          timestamp: new Date().toISOString(),
        }, ...prev].slice(0, 100)); // 最新100件保持
      });
    });

    return () => socket.disconnect();
  }, []);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { socket: socketRef.current, connected, events, clearEvents };
}
