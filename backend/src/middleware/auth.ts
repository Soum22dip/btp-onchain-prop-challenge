// =============================================================================
// Setl8 Backend — Auth Middleware
//
// verifyJWT  — Fastify preHandler that validates the Bearer JWT
// verifyAdmin — Fastify preHandler that validates the X-Admin-Secret header
// =============================================================================

import type { FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

// ---------------------------------------------------------------------------
// JWT payload type augmentation
// ---------------------------------------------------------------------------

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { traderId: string; walletAddress: string };
    user: { traderId: string; walletAddress: string };
  }
}

// ---------------------------------------------------------------------------
// verifyJWT
// ---------------------------------------------------------------------------

/**
 * Validates the `Authorization: Bearer <token>` header.
 * On success the decoded payload is available as `request.user`.
 */
export async function verifyJWT(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.status(401).send({ success: false, error: 'Unauthorized' });
  }
}

// ---------------------------------------------------------------------------
// verifyAdmin
// ---------------------------------------------------------------------------

/**
 * Validates the `X-Admin-Secret` request header against ADMIN_SECRET.
 * Returns 401 if missing or incorrect.
 */
export async function verifyAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const secret = request.headers['x-admin-secret'];
  const expected = Buffer.from(config.adminSecret, 'utf8');
  const provided = Buffer.from(String(secret ?? ''), 'utf8');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return reply.status(401).send({ success: false, error: 'Unauthorized' });
  }
}
