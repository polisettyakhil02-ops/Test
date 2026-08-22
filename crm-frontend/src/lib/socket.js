import { io } from 'socket.io-client';
import { getToken } from '../api/client';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

let chatSocket = null;

// One shared connection per tab, created lazily on first use and reused by
// every component that needs it - matches api/client.js's single fetch
// wrapper pattern (one place that knows how auth is attached).
export function getChatSocket() {
  if (chatSocket) return chatSocket;
  chatSocket = io(`${API_BASE}/chat`, {
    auth: { token: getToken() },
    autoConnect: true,
  });
  return chatSocket;
}

export function disconnectChatSocket() {
  chatSocket?.disconnect();
  chatSocket = null;
}
