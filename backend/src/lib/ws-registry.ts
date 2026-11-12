// =============================================================================
// Setl8 Backend — WebSocket Client Registry
//
// Tracks which WebSocket connections belong to which trader so events can be
// delivered only to the right client(s).  Imported by both the WS route
// handler (to register/unregister) and the evaluator (to emit targeted events).
// =============================================================================

// Minimal interface covering the subset of ws.WebSocket we need
interface SocketLike {
  readyState: number;
  send(data: string): void;
}

const registry = new Map<string, Set<SocketLike>>();

// ---------------------------------------------------------------------------
// registerClient
// ---------------------------------------------------------------------------

export function registerClient(traderId: string, socket: SocketLike): void {
  let sockets = registry.get(traderId);
  if (!sockets) {
    sockets = new Set();
    registry.set(traderId, sockets);
  }
  sockets.add(socket);
}

// ---------------------------------------------------------------------------
// unregisterClient
// ---------------------------------------------------------------------------

export function unregisterClient(traderId: string, socket: SocketLike): void {
  const sockets = registry.get(traderId);
  if (!sockets) return;
  sockets.delete(socket);
  if (sockets.size === 0) registry.delete(traderId);
}

// ---------------------------------------------------------------------------
// emitToTrader
// ---------------------------------------------------------------------------

/**
 * Sends a JSON payload to all open WebSocket connections belonging to the
 * specified trader.  Non-fatal if the socket is no longer open.
 */
export function emitToTrader(traderId: string, payload: unknown): void {
  const sockets = registry.get(traderId);
  if (!sockets || sockets.size === 0) return;

  const json = JSON.stringify(payload);
  for (const ws of sockets) {
    try {
      if (ws.readyState === 1 /* OPEN */) ws.send(json);
    } catch {
      // Best-effort delivery
    }
  }
}
