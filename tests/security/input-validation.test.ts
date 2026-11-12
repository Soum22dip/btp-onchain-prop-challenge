// =============================================================================
// Security Tests — Input Validation
//
// Tests that the system rejects:
//   1. SQL injection payloads
//   2. XSS payloads in string fields
//   3. Invalid market names
//   4. Invalid enum values
//   5. Negative/NaN/Infinity amounts
//   6. Oversized payloads
//   7. Type confusion attacks
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
  const c = await createChallenge(WALLET, 10_000);
  jwt = await signJwt({ traderId: c.traderId, walletAddress: WALLET });
}, 30_000);

describe('Input Validation — SQL Injection', () => {
  const sqliPayloads = [
    "'; DROP TABLE traders; --",
    "1' OR '1'='1",
    "1; SELECT * FROM pg_catalog.pg_tables --",
    "' UNION SELECT username, password FROM users --",
    "admin'--",
  ];

  for (const payload of sqliPayloads) {
    it(`rejects SQL injection in market field: "${payload.slice(0, 30)}"`, async () => {
      const { status } = await api('/api/positions', {
        method: 'POST',
        headers: authHeader(jwt),
        body: JSON.stringify({ market: payload, side: 'LONG', sizeUsd: 100 }),
      });
      // Should be rejected by Zod enum validation (400), not cause a 500
      expect(status).toBeLessThan(500);
      expect(status).toBe(400);
    });
  }

  it('rejects SQL injection in position ID path param', async () => {
    const { status } = await api(
      "/api/positions/' OR '1'='1/close",
      { method: 'POST', headers: authHeader(jwt) },
    );
    expect(status).toBeLessThan(500);
  });
});

describe('Input Validation — XSS Payloads', () => {
  const xssPayloads = [
    '<script>alert("xss")</script>',
    '<img src=x onerror=alert(1)>',
    'javascript:alert(1)',
    '"><svg onload=alert(1)>',
    "';!--\"<XSS>=&{()}",
  ];

  for (const payload of xssPayloads) {
    it(`rejects XSS in wallet address: "${payload.slice(0, 25)}"`, async () => {
      const { status, body } = await api('/api/dev/create-challenge', {
        method: 'POST',
        body: JSON.stringify({ walletAddress: payload, accountSize: 10_000 }),
      });
      expect(status).toBe(400);
      // Even if accepted somehow, the response should not reflect the payload unescaped
      const bodyStr = JSON.stringify(body);
      expect(bodyStr).not.toContain('<script>');
      expect(bodyStr).not.toContain('onerror=');
    });
  }
});

describe('Input Validation — Invalid Market Names', () => {
  const invalidMarkets = [
    'INVALID',
    'btc', // lowercase
    'BTC/USD', // slash
    'BTC-PERP',
    '',
    'A'.repeat(1000),
    null,
    123,
    true,
  ];

  for (const market of invalidMarkets) {
    it(`rejects invalid market: ${JSON.stringify(market)?.slice(0, 30)}`, async () => {
      const { status } = await api('/api/positions', {
        method: 'POST',
        headers: authHeader(jwt),
        body: JSON.stringify({ market, side: 'LONG', sizeUsd: 100 }),
      });
      expect(status).toBe(400);
    });
  }
});

describe('Input Validation — Invalid Side Values', () => {
  const invalidSides = ['long', 'short', 'BUY', 'SELL', '', null, 123];

  for (const side of invalidSides) {
    it(`rejects invalid side: ${JSON.stringify(side)}`, async () => {
      const { status } = await api('/api/positions', {
        method: 'POST',
        headers: authHeader(jwt),
        body: JSON.stringify({ market: 'BTC', side, sizeUsd: 100 }),
      });
      expect(status).toBe(400);
    });
  }
});

describe('Input Validation — Numeric Edge Cases', () => {
  const badAmounts = [
    { label: 'negative', value: -100 },
    { label: 'zero', value: 0 },
    { label: 'NaN string', value: 'NaN' },
    { label: 'Infinity', value: 'Infinity' },
    { label: 'string number', value: '100' },
    { label: 'very large', value: Number.MAX_SAFE_INTEGER },
    { label: 'float precision', value: 0.1 + 0.2 },
    { label: 'null', value: null },
    { label: 'undefined', value: undefined },
    { label: 'boolean', value: true },
  ];

  for (const { label, value } of badAmounts) {
    it(`handles sizeUsd = ${label} (${value}) without 500`, async () => {
      const { status } = await api('/api/positions', {
        method: 'POST',
        headers: authHeader(jwt),
        body: JSON.stringify({ market: 'BTC', side: 'LONG', sizeUsd: value }),
      });
      // Should be 400 (bad input) or 201 (if valid), never 500
      expect(status).toBeLessThan(500);
    });
  }
});

describe('Input Validation — Oversized Payloads', () => {
  it('rejects a 1MB payload without crashing', async () => {
    const bigPayload = JSON.stringify({
      market: 'BTC',
      side: 'LONG',
      sizeUsd: 100,
      junk: 'A'.repeat(1_000_000),
    });

    const res = await fetch('http://localhost:3001/api/positions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: bigPayload,
    });
    // Should reject with 413 (Payload Too Large) or 400, not crash
    expect(res.status).toBeLessThan(500);
  });
});

describe('Input Validation — Type Confusion', () => {
  it('rejects array where object expected', async () => {
    const { status } = await api('/api/positions', {
      method: 'POST',
      headers: authHeader(jwt),
      body: JSON.stringify([{ market: 'BTC', side: 'LONG', sizeUsd: 100 }]),
    });
    expect(status).toBe(400);
  });

  it('rejects nested object injection', async () => {
    const { status } = await api('/api/positions', {
      method: 'POST',
      headers: authHeader(jwt),
      body: JSON.stringify({
        market: 'BTC',
        side: 'LONG',
        sizeUsd: { $gt: 0 }, // NoSQL-style injection
      }),
    });
    expect(status).toBe(400);
  });

  it('handles __proto__ pollution attempt', async () => {
    const { status } = await api('/api/positions', {
      method: 'POST',
      headers: authHeader(jwt),
      body: JSON.stringify({
        market: 'BTC',
        side: 'LONG',
        sizeUsd: 100,
        __proto__: { isAdmin: true },
        constructor: { prototype: { isAdmin: true } },
      }),
    });
    // Should either accept (ignoring extra fields) or reject, never crash
    expect(status).toBeLessThan(500);
  });
});

describe('Input Validation — UUID Tampering', () => {
  const badUuids = [
    'not-a-uuid',
    '00000000-0000-0000-0000-000000000000', // nil UUID
    '../../../etc/passwd',
    "1' OR 1=1 --",
    'a'.repeat(100),
  ];

  for (const id of badUuids) {
    it(`rejects invalid position UUID: "${id.slice(0, 30)}"`, async () => {
      const { status } = await api(`/api/positions/${encodeURIComponent(id)}/close`, {
        method: 'POST',
        headers: authHeader(jwt),
      });
      // Should be 400 (invalid UUID) or 404 (not found), never 500
      expect(status).toBeLessThan(500);
    });
  }
});
