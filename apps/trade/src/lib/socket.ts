// Native WebSocket client for Setl8 backend
// Backend endpoint: ws://localhost:3001/api/ws?token=<jwt>

const WS_URL = (process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001')
  .replace('http://', 'ws://')
  .replace('https://', 'wss://');

type MessageHandler = (data: unknown) => void;

interface WSClient {
  ws: WebSocket | null;
  handlers: Map<string, Set<MessageHandler>>;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  token: string | null;
}

const client: WSClient = {
  ws: null,
  handlers: new Map(),
  reconnectTimer: null,
  token: null,
};

function connect(token: string | null) {
  if (client.ws?.readyState === WebSocket.OPEN) return;

  const url = token
    ? `${WS_URL}/api/ws?token=${encodeURIComponent(token)}`
    : null;

  // Backend requires auth — skip unauthenticated connections
  if (!url) return;

  const ws = new WebSocket(url);
  client.ws = ws;
  client.token = token;

  ws.onopen = () => {
    emit('connect', {});
    if (client.reconnectTimer) {
      clearTimeout(client.reconnectTimer);
      client.reconnectTimer = null;
    }
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as { event: string; data: unknown };
      emit(msg.event, msg.data);
    } catch {
      // ignore parse errors
    }
  };

  ws.onclose = () => {
    emit('disconnect', {});
    client.ws = null;
    // Reconnect after 3 seconds
    client.reconnectTimer = setTimeout(() => {
      if (client.token) connect(client.token);
    }, 3000);
  };

  ws.onerror = () => {
    ws.close();
  };
}

function emit(event: string, data: unknown) {
  const handlers = client.handlers.get(event);
  if (handlers) {
    handlers.forEach((h) => h(data));
  }
}

export function getSocket(token: string | null) {
  if (token && token !== client.token) {
    // New token — reconnect
    disconnect();
    connect(token);
  } else if (token && !client.ws) {
    connect(token);
  }

  return {
    on(event: string, handler: MessageHandler) {
      if (!client.handlers.has(event)) {
        client.handlers.set(event, new Set());
      }
      client.handlers.get(event)!.add(handler);
    },
    off(event: string, handler?: MessageHandler) {
      if (handler) {
        client.handlers.get(event)?.delete(handler);
      } else {
        client.handlers.delete(event);
      }
    },
    connected: client.ws?.readyState === WebSocket.OPEN,
  };
}

export function disconnectSocket() {
  disconnect();
}

function disconnect() {
  if (client.reconnectTimer) {
    clearTimeout(client.reconnectTimer);
    client.reconnectTimer = null;
  }
  client.ws?.close();
  client.ws = null;
  client.token = null;
}
