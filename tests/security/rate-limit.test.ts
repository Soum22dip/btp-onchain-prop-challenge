// =============================================================================
// Security Tests — Rate Limiting
//
// Hammers endpoints to check if the server:
//   1. Handles burst traffic without crashing
//   2. Returns consistent responses under load
//   3. (If rate limiting is implemented) Returns 429 after threshold
//
// NOTE: If no rate limiter is configured, these tests document that as a
// finding — the system SHOULD rate-limit in production.
// =============================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import {
  api,
  authHeader,
  signJwt,
  createChallenge,
  waitForServer,
} from './helpers.js';

const WALLET = 'H3UqmLrUGNxVEya7LrW4QFN7yxGwaWsjxc9EpsR1WndS';
let jwt: string;

beforeAll(async () => {
  await waitForServer();
  const trader = await createChallenge(WALLET, 10_000);
  jwt = await signJwt({ traderId: trader.traderId, walletAddress: WALLET });
}, 30_000);

async function burst(
  path: string,
  count: number,
  opts: RequestInit = {},
): Promise<{ statuses: number[]; durationMs: number }> {
  const start = Date.now();
  const promises = Array.from({ length: count }, () =>
    api(path, opts).then((r) => r.status),
  );
  const statuses = await Promise.all(promises);
  return { statuses, durationMs: Date.now() - start };
}

describe('Rate Limiting — Public Endpoints', () => {
  it('handles 100 concurrent /health requests without crashing', async () => {
    const { statuses, durationMs } = await burst('/health', 100);
    const okCount = statuses.filter((s) => s === 200).length;

    // Server should not crash — all should be 200 or 429
    expect(statuses.every((s) => s === 200 || s === 429)).toBe(true);
    console.log(
      `  /health burst: ${okCount}/100 OK, ${100 - okCount} rate-limited, ${durationMs}ms`,
    );
  });

  it('handles 50 concurrent /api/prices requests', async () => {
    const { statuses, durationMs } = await burst('/api/prices', 50);
    const okCount = statuses.filter((s) => s === 200).length;

    expect(statuses.every((s) => s === 200 || s === 429)).toBe(true);
    console.log(
      `  /api/prices burst: ${okCount}/50 OK, ${durationMs}ms`,
    );
  });
});

describe('Rate Limiting — Authenticated Endpoints', () => {
  it('handles 50 concurrent /api/positions reads', async () => {
    const { statuses, durationMs } = await burst('/api/positions', 50, {
      headers: authHeader(jwt),
    });
    const okCount = statuses.filter((s) => s === 200).length;

    expect(statuses.every((s) => s === 200 || s === 429)).toBe(true);
    console.log(
      `  /api/positions burst: ${okCount}/50 OK, ${durationMs}ms`,
    );
  });

  it('handles 30 concurrent position open attempts', async () => {
    const { statuses, durationMs } = await burst('/api/positions', 30, {
      method: 'POST',
      headers: authHeader(jwt),
      body: JSON.stringify({ market: 'BTC', side: 'LONG', sizeUsd: 10 }),
    });

    // Should get a mix of 201 (created) and 400 (insufficient balance / max positions)
    // Should NOT get 500 (server crash)
    const serverErrors = statuses.filter((s) => s >= 500).length;
    expect(serverErrors).toBe(0);
    console.log(
      `  position open burst: statuses=${JSON.stringify(
        Object.entries(
          statuses.reduce(
            (acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }),
            {} as Record<number, number>,
          ),
        ),
      )}, ${durationMs}ms`,
    );
  });
});

describe('Rate Limiting — Auth Endpoint Abuse', () => {
  it('survives 100 rapid auth nonce requests without crashing', async () => {
    const { statuses, durationMs } = await burst('/api/auth/nonce', 100, {
      method: 'POST',
      body: JSON.stringify({ walletAddress: WALLET }),
    });

    const serverErrors = statuses.filter((s) => s >= 500).length;
    expect(serverErrors).toBe(0);
    console.log(
      `  /api/auth/nonce burst: ${statuses.filter((s) => s === 200 || s === 201).length}/100 OK, ${serverErrors} errors, ${durationMs}ms`,
    );
  });
});

describe('Rate Limiting — FINDING: No rate limiter detected', () => {
  it('DOCUMENTS that no 429 responses are returned (rate limiter not configured)', async () => {
    const { statuses } = await burst('/health', 100);
    const rateLimited = statuses.filter((s) => s === 429).length;

    // This test PASSES if there's no rate limiter (documents the finding)
    // It would need updating once rate limiting is added
    if (rateLimited === 0) {
      console.log(
        '  FINDING: No rate limiting detected — all 100 requests returned 200.',
        'Consider adding @fastify/rate-limit for production.',
      );
    }
    // Either way, the server should not crash
    expect(statuses.every((s) => s < 500)).toBe(true);
  });
});
