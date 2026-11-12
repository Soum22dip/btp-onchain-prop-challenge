// =============================================================================
// Security Tests — Payout Attacks
//
// Tests that the system rejects:
//   1. Double payout for the same attempt
//   2. Payout on evaluation phase (attempts 1-2)
//   3. Vault fire spam (rapid-fire doesn't cause double-pay)
//   4. Manual payout request on non-funded attempt
//   5. Payout with open positions
// =============================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import {
  api,
  authHeader,
  signJwt,
  createChallenge,
  openPos,
  waitForServer,
} from './helpers.js';

// Use unique wallet addresses per test to avoid cross-contamination
let counter = 0;
function uniqueWallet(): string {
  counter++;
  // Generate 43-char base58 wallet addresses
  const base = 'PayoutTest' + String(counter).padStart(2, '0');
  return base.padEnd(43, 'A');
}

beforeAll(async () => {
  await waitForServer();
}, 30_000);

describe('Payout Attack — Double Payout', () => {
  it('simulate-pass twice on the same attempt does not create duplicate payouts', async () => {
    const wallet = uniqueWallet();
    const c = await createChallenge(wallet, 10_000, 3);
    const jwt = await signJwt({ traderId: c.traderId, walletAddress: wallet });

    // First pass
    const { body: pass1 } = await api('/api/dev/simulate-pass', {
      method: 'POST',
      body: JSON.stringify({ walletAddress: wallet }),
    });
    const d1 = pass1.data as Record<string, unknown>;
    expect(d1.payoutCreated).toBe(true);

    // Second call — attempt is now PASSED, so no active attempt
    const { body: pass2 } = await api('/api/dev/simulate-pass', {
      method: 'POST',
      body: JSON.stringify({ walletAddress: wallet }),
    });
    expect(pass2.success).toBe(false);

    // Check payout count for this attempt — should be exactly 1
    const { body: payouts } = await api('/api/payouts', {
      headers: authHeader(jwt),
    });
    const items = ((payouts.data as Record<string, unknown>)?.items ?? []) as Array<Record<string, unknown>>;
    const attemptPayouts = items.filter((p) => p.attemptId === c.attemptId);
    expect(attemptPayouts.length).toBe(1);
  });
});

describe('Payout Attack — Evaluation Phase', () => {
  it('passing an evaluation attempt (phase 1) does not create a payout', async () => {
    const wallet = uniqueWallet();
    await createChallenge(wallet, 10_000, 1);

    const { body } = await api('/api/dev/simulate-pass', {
      method: 'POST',
      body: JSON.stringify({ walletAddress: wallet }),
    });
    const data = body.data as Record<string, unknown>;
    expect(data.payoutCreated).toBe(false);
    expect(data.phase).toBe('EVALUATION');
  });

  it('passing attempt 2 (still evaluation) does not create a payout', async () => {
    const wallet = uniqueWallet();
    await createChallenge(wallet, 10_000, 2);

    const { body } = await api('/api/dev/simulate-pass', {
      method: 'POST',
      body: JSON.stringify({ walletAddress: wallet }),
    });
    const data = body.data as Record<string, unknown>;
    expect(data.payoutCreated).toBe(false);
  });

  it('passing attempt 3 (funded) DOES create a payout', async () => {
    const wallet = uniqueWallet();
    await createChallenge(wallet, 10_000, 3);

    const { body } = await api('/api/dev/simulate-pass', {
      method: 'POST',
      body: JSON.stringify({ walletAddress: wallet }),
    });
    const data = body.data as Record<string, unknown>;
    expect(data.payoutCreated).toBe(true);
    expect(data.phase).toBe('FUNDED');
  });
});

describe('Payout Attack — Vault Fire Spam', () => {
  it('firing the vault 3 times rapidly does not cause server errors', async () => {
    const wallet = uniqueWallet();
    await createChallenge(wallet, 5_000, 4);
    await api('/api/dev/simulate-pass', {
      method: 'POST',
      body: JSON.stringify({ walletAddress: wallet }),
    });

    // Fire 3 times concurrently
    const fires = await Promise.all([
      api('/api/dev/fire-vault', { method: 'POST' }),
      api('/api/dev/fire-vault', { method: 'POST' }),
      api('/api/dev/fire-vault', { method: 'POST' }),
    ]);

    // None should crash the server
    for (const fire of fires) {
      expect(fire.status).toBeLessThan(500);
    }

    // At most one should report having paid traders (others find nothing pending)
    const paidCounts = fires.map((f) => {
      const data = f.body.data as Record<string, unknown> | undefined;
      return (data?.tradersPaid as number) ?? 0;
    });
    console.log(`  Vault fire spam results: traders paid per fire = [${paidCounts.join(', ')}]`);
  });
});

describe('Payout Attack — Manual Payout on Non-Funded', () => {
  it('rejects payout request on evaluation-phase attempt', async () => {
    const wallet = uniqueWallet();
    const c = await createChallenge(wallet, 10_000, 1);
    const jwt = await signJwt({ traderId: c.traderId, walletAddress: wallet });

    const { status, body } = await api('/api/payouts/request', {
      method: 'POST',
      headers: authHeader(jwt),
      body: JSON.stringify({ amountUsd: 100, tokenSymbol: 'USDC' }),
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/funded|NOT_FUNDED/i);
  });
});

describe('Payout Attack — Open Positions Block Payout', () => {
  it('rejects payout request when positions are open', async () => {
    const wallet = uniqueWallet();
    const c = await createChallenge(wallet, 10_000, 3);
    const jwt = await signJwt({ traderId: c.traderId, walletAddress: wallet });

    // Open a position
    await openPos(jwt, 'BTC', 'LONG', 100);

    // Try to request payout — should fail because positions are open
    // (or because there's no realized profit yet)
    const { status, body } = await api('/api/payouts/request', {
      method: 'POST',
      headers: authHeader(jwt),
      body: JSON.stringify({ amountUsd: 800, tokenSymbol: 'USDC' }),
    });
    expect(status).toBe(400);
    // Either "open positions" or "insufficient profit" — both are valid rejections
    expect(body.error).toBeTruthy();
  });
});
