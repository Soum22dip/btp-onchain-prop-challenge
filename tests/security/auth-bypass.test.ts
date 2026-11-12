// =============================================================================
// Security Tests — Authentication Bypass
//
// Tests that the system rejects:
//   1. Missing auth headers
//   2. Malformed / garbage tokens
//   3. Expired JWTs
//   4. JWTs signed with the wrong secret (forgery)
//   5. Cross-trader access (trader A using trader B's resources)
// =============================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import {
  api,
  authHeader,
  signJwt,
  createChallenge,
  openPos,
  waitForServer,
  requireEnv,
} from './helpers.js';

const WALLET_A = 'H3UqmLrUGNxVEya7LrW4QFN7yxGwaWsjxc9EpsR1WndS';
const WALLET_B = 'TestWa11et2BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

let traderA: { traderId: string; attemptId: string };
let traderB: { traderId: string; attemptId: string };
let jwtA: string;
let jwtB: string;

beforeAll(async () => {
  await waitForServer();
  traderA = await createChallenge(WALLET_A, 10_000);
  traderB = await createChallenge(WALLET_B, 5_000);
  jwtA = await signJwt({ traderId: traderA.traderId, walletAddress: WALLET_A });
  jwtB = await signJwt({ traderId: traderB.traderId, walletAddress: WALLET_B });
}, 30_000);

describe('Auth Bypass — Missing Auth', () => {
  const protectedEndpoints = [
    ['GET', '/api/positions'],
    ['GET', '/api/trader/profile'],
    ['GET', '/api/trader/challenge'],
    ['GET', '/api/trader/pnl'],
    ['GET', '/api/payouts'],
    ['GET', '/api/attempts'],
  ] as const;

  for (const [method, path] of protectedEndpoints) {
    it(`rejects ${method} ${path} without auth`, async () => {
      const { status } = await api(path, { method });
      expect(status).toBe(401);
    });
  }

  it('rejects POST /api/positions without auth', async () => {
    const res = await fetch('http://localhost:3001/api/positions', { method: 'POST' });
    expect(res.status).toBe(401);
  });
});

describe('Auth Bypass — Malformed Tokens', () => {
  const badTokens = [
    'not-a-jwt',
    'eyJhbGciOiJIUzI1NiJ9.garbage.mogarbage',
    '',
    'Bearer',
    'null',
    'undefined',
    'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ0cmFkZXJJZCI6InRlc3QifQ.',
  ];

  for (const token of badTokens) {
    it(`rejects malformed token: "${token.slice(0, 30)}..."`, async () => {
      const { status } = await api('/api/positions', {
        headers: authHeader(token),
      });
      expect(status).toBe(401);
    });
  }
});

describe('Auth Bypass — Expired Token', () => {
  it('rejects an expired JWT', async () => {
    const { createSigner } = await import('fast-jwt');
    // Create a token that expires in 1ms, then wait for it to expire
    const signer = createSigner({
      key: requireEnv('JWT_SECRET'),
      expiresIn: 1,
    });
    const expiredJwt = signer({
      traderId: traderA.traderId,
      walletAddress: WALLET_A,
    });
    // Wait 50ms for it to expire
    await new Promise((r) => setTimeout(r, 50));

    const { status } = await api('/api/positions', {
      headers: authHeader(expiredJwt),
    });
    expect(status).toBe(401);
  });
});

describe('Auth Bypass — Wrong Secret (Forgery)', () => {
  it('rejects a JWT signed with a different secret', async () => {
    const { createSigner } = await import('fast-jwt');
    const signer = createSigner({
      key: 'totally-wrong-secret-key-attempt',
      expiresIn: 60_000,
    });
    const forgedJwt = signer({
      traderId: traderA.traderId,
      walletAddress: WALLET_A,
    });

    const { status } = await api('/api/positions', {
      headers: authHeader(forgedJwt),
    });
    expect(status).toBe(401);
  });
});

describe('Auth Bypass — Cross-Trader Access', () => {
  it('trader B cannot close trader A\'s position', async () => {
    // Re-create trader A's challenge fresh (previous tests may have consumed it)
    const freshA = await createChallenge(WALLET_A, 10_000);
    const freshJwtA = await signJwt({ traderId: freshA.traderId, walletAddress: WALLET_A });

    // Trader A opens a position
    const posId = await openPos(freshJwtA, 'BTC', 'LONG', 100);
    expect(posId).toBeTruthy();

    // Trader B tries to close it — should be rejected (403 or 400)
    const { status, body } = await api(`/api/positions/${posId}/close`, {
      method: 'POST',
      headers: authHeader(jwtB),
    });
    // The system rejects it — either 403 (forbidden) or 400 (attempt mismatch)
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  it('trader B cannot see trader A\'s challenge data', async () => {
    const { body: challengeA } = await api('/api/trader/challenge', {
      headers: authHeader(jwtA),
    });
    const { body: challengeB } = await api('/api/trader/challenge', {
      headers: authHeader(jwtB),
    });

    const dataA = challengeA.data as Record<string, unknown> | null;
    const dataB = challengeB.data as Record<string, unknown> | null;

    // Both should get their own data, not each other's
    if (dataA && dataB) {
      expect(dataA.attemptId).not.toBe(dataB.attemptId);
    }
  });
});

describe('Auth Bypass — Admin Endpoints', () => {
  it('rejects admin endpoint without X-Admin-Secret', async () => {
    const { status } = await api('/api/admin/traders');
    expect(status).toBe(401);
  });

  it('rejects admin endpoint with wrong secret', async () => {
    const { status } = await api('/api/admin/traders', {
      headers: { 'X-Admin-Secret': 'wrong-secret' },
    });
    expect(status).toBe(401);
  });

  it('rejects admin endpoint with regular JWT (not admin secret)', async () => {
    const { status } = await api('/api/admin/traders', {
      headers: authHeader(jwtA),
    });
    expect(status).toBe(401);
  });
});
