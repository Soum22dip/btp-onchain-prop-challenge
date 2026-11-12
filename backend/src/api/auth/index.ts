// =============================================================================
// Setl8 Backend — Auth Routes
//
// POST /api/auth/nonce   — generate a sign-in nonce for a wallet address
// POST /api/auth/verify  — verify Ed25519 signature, issue JWT
// =============================================================================

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { PublicKey } from '@solana/web3.js';
import crypto from 'node:crypto';
import bs58 from 'bs58';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const solanaAddress = z
  .string()
  .min(32)
  .max(44)
  .refine((val) => {
    try {
      new PublicKey(val);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid Solana wallet address');

const NonceBodySchema = z.object({
  walletAddress: solanaAddress,
});

const VerifyBodySchema = z.object({
  walletAddress: solanaAddress,
  signature: z.string().min(1, 'Signature is required'),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NONCE_TTL_SECONDS = 300; // 5 minutes

function nonceKey(walletAddress: string): string {
  return `nonce:${walletAddress}`;
}

function buildSignMessage(nonce: string): string {
  return [
    'Sign this message to log in to Setl8.',
    '',
    `Nonce: ${nonce}`,
  ].join('\n');
}

/**
 * Verifies an Ed25519 signature produced by a Solana wallet.
 *
 * Uses Node.js's built-in `crypto` module (no extra dependencies).
 * The public key (32 raw bytes) is wrapped in an Ed25519 SPKI DER envelope
 * so Node.js can import it with `createPublicKey`.
 */
function verifyWalletSignature(
  walletAddress: string,
  message: string,
  signatureBase58: string,
): boolean {
  try {
    const pubkeyBytes = new PublicKey(walletAddress).toBytes();

    // ASN.1 DER SPKI prefix for Ed25519:  30 2a 30 05 06 03 2b 65 70 03 21 00
    const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
    const derKey = Buffer.concat([spkiPrefix, Buffer.from(pubkeyBytes)]);

    const keyObject = crypto.createPublicKey({ key: derKey, format: 'der', type: 'spki' });
    const messageBytes = Buffer.from(message, 'utf-8');
    const signatureBytes = Buffer.from(bs58.decode(signatureBase58));

    return crypto.verify(null, messageBytes, keyObject, signatureBytes);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // -------------------------------------------------------------------------
  // POST /api/auth/nonce
  // -------------------------------------------------------------------------
  app.post('/nonce', async (request, reply) => {
    const parseResult = NonceBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: parseResult.error.issues[0]?.message ?? 'Invalid request body',
      });
    }

    const { walletAddress } = parseResult.data;

    // Upsert the trader record so the nonce can be linked to a traderId later
    const trader = await prisma.trader.upsert({
      where: { walletAddress },
      create: { walletAddress },
      update: {},
      select: { id: true },
    });

    const nonce = uuidv4();
    const message = buildSignMessage(nonce);

    await redis.setex(nonceKey(walletAddress), NONCE_TTL_SECONDS, nonce);

    request.log.info({ walletAddress, traderId: trader.id }, 'Nonce issued');

    return reply.status(200).send({
      success: true,
      data: { nonce, message },
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/auth/verify
  // -------------------------------------------------------------------------
  app.post('/verify', async (request, reply) => {
    const parseResult = VerifyBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: parseResult.error.issues[0]?.message ?? 'Invalid request body',
      });
    }

    const { walletAddress, signature } = parseResult.data;

    // Atomic get + delete — prevents nonce replay via concurrent requests
    const nonce = await redis.getdel(nonceKey(walletAddress));
    if (!nonce) {
      return reply.status(401).send({
        success: false,
        error: 'Nonce expired or not found — request a new nonce',
      });
    }

    const message = buildSignMessage(nonce);
    const valid = verifyWalletSignature(walletAddress, message, signature);

    if (!valid) {
      return reply.status(401).send({ success: false, error: 'Invalid signature' });
    }

    // Fetch or create the trader
    const trader = await prisma.trader.upsert({
      where: { walletAddress },
      create: { walletAddress },
      update: {},
      select: {
        id: true,
        walletAddress: true,
        status: true,
        fraudFlags: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { attempts: true } },
        payoutRequests: {
          where: { status: 'COMPLETED' },
          select: { amountUsd: true },
        },
        attempts: {
          where: { status: 'ACTIVE' },
          select: { id: true },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (trader.status === 'BANNED') {
      return reply.status(403).send({ success: false, error: 'Account is banned' });
    }

    const totalPayoutsUsd = trader.payoutRequests.reduce(
      (sum: number, r: { amountUsd: unknown }) => sum + Number(r.amountUsd),
      0,
    );

    const token = await reply.jwtSign({
      traderId: trader.id,
      walletAddress: trader.walletAddress,
    });

    request.log.info({ traderId: trader.id, walletAddress }, 'Trader authenticated');

    return reply.status(200).send({
      success: true,
      data: {
        token,
        trader: {
          id: trader.id,
          walletAddress: trader.walletAddress,
          status: trader.status,
          fraudFlags: trader.fraudFlags,
          createdAt: trader.createdAt,
          updatedAt: trader.updatedAt,
          totalAttempts: trader._count.attempts,
          activeAttemptId: trader.attempts[0]?.id ?? null,
          totalPayoutsUsd,
        },
      },
    });
  });
};
