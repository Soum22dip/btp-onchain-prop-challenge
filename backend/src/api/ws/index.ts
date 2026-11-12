// =============================================================================
// Setl8 Backend — WebSocket Route
//
// Endpoint: GET /api/ws?token=<jwt>
//
// Authentication: JWT is passed as a query-string parameter because browser
// WebSocket APIs do not support custom headers.
//
// On connect:
//   - Verify the JWT
//   - Register the connection in the WS registry (keyed by traderId)
//   - Send an initial "connected" acknowledgement
//
// On disconnect:
//   - Unregister from the WS registry
//
// The evaluator emits targeted P&L events via the registry so each trader
// only receives events for their own attempts.
// =============================================================================

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerClient, unregisterClient } from '../../lib/ws-registry.js';

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export const wsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get(
    '/',
    { websocket: true },
    (socket, request) => {
      // ------------------------------------------------------------------
      // Authenticate via JWT query param
      // ------------------------------------------------------------------
      const query = request.query as Record<string, string | undefined>;
      const token = query['token'];

      if (!token) {
        socket.close(1008, 'Missing token');
        return;
      }

      let traderId: string;
      try {
        const payload = app.jwt.verify<{ traderId: string; walletAddress: string }>(token);
        traderId = payload.traderId;
      } catch {
        socket.close(1008, 'Invalid or expired token');
        return;
      }

      // ------------------------------------------------------------------
      // Register and acknowledge
      // ------------------------------------------------------------------
      registerClient(traderId, socket);

      socket.send(
        JSON.stringify({
          event: 'connected',
          data: { traderId, message: 'WebSocket connection established' },
        }),
      );

      // ------------------------------------------------------------------
      // Cleanup on disconnect
      // ------------------------------------------------------------------
      socket.on('close', () => {
        unregisterClient(traderId, socket);
      });

      // The server is push-only; ignore any client messages
      socket.on('message', () => {
        // No-op — clients should not send messages
      });
    },
  );
};
