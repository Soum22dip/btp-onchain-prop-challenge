// =============================================================================
// Setl8 Backend — Solana Utilities (v2)
//
// Centralises all Solana/SPL interactions:
//   - Connection + keypair loading
//   - PDA vault derivation
//   - Payout vault token balance queries
//   - On-chain result submission (split: no_payout / with_payout)
//   - Heartbeat system (open / process / close)
//   - Transaction confirmation helper
// =============================================================================

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
  getAccount,
  TokenAccountNotFoundError,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import fs from 'node:fs';
import { config } from '../config.js';
import {
  VAULT_PROGRAM_ID,
  VAULT_STATE_SEED,
  PAYOUT_VAULT_SEED,
  TRADER_ACCOUNT_SEED,
  PHASE_RESULT_SEED,
  PAYOUT_REQUEST_SEED,
} from '@setl8/constants';
import { createHash } from 'node:crypto';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Constants — token mint addresses per cluster
// ---------------------------------------------------------------------------

type MintAddresses = {
  USDC: string;
  USDT: string;
  USD1: string | null;
};

const DEVNET_MINTS: MintAddresses = {
  USDC: process.env['USDC_DEVNET_MINT'] || 'BpkjNnKSRCsNJMAMKtLs1jJCZpcnEh8ZqmMdRZA8QKBC',
  USDT: process.env['USDC_DEVNET_MINT'] || 'BpkjNnKSRCsNJMAMKtLs1jJCZpcnEh8ZqmMdRZA8QKBC',
  USD1: process.env['USDC_DEVNET_MINT'] || 'BpkjNnKSRCsNJMAMKtLs1jJCZpcnEh8ZqmMdRZA8QKBC',
};

const MAINNET_MINTS: MintAddresses = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  USD1: 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',
};

// ---------------------------------------------------------------------------
// Keypair loading — supports file path or base64-encoded secret
// ---------------------------------------------------------------------------

function loadKeypair(pathOrBase64: string): Keypair {
  if (fs.existsSync(pathOrBase64)) {
    const raw = fs.readFileSync(pathOrBase64, 'utf-8');
    const secretKey = Uint8Array.from(JSON.parse(raw) as number[]);
    return Keypair.fromSecretKey(secretKey);
  }

  try {
    const decoded = Buffer.from(pathOrBase64, 'base64');
    return Keypair.fromSecretKey(decoded);
  } catch {
    throw new Error(
      `[solana] Failed to load keypair from: ${pathOrBase64} — must be a valid file path or base64-encoded secret key`,
    );
  }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

export const connection = new Connection(config.solanaRpcUrl, 'confirmed');

/** Admin/protocol keypair — signs all program instructions */
export const protocolKeypair = loadKeypair(config.protocolKeypair);

// Resolve mint addresses based on the RPC cluster
const mints: MintAddresses = config.solanaRpcUrl.includes('mainnet')
  ? MAINNET_MINTS
  : DEVNET_MINTS;

export const SUPPORTED_MINTS = mints;

// ---------------------------------------------------------------------------
// PDA derivation
// ---------------------------------------------------------------------------

const PROGRAM_ID = new PublicKey(
  config.vaultProgramId || VAULT_PROGRAM_ID,
);

/** VaultState PDA: seeds = ["vault_state"] */
export const [vaultStatePda] = PublicKey.findProgramAddressSync(
  [Buffer.from(VAULT_STATE_SEED)],
  PROGRAM_ID,
);

/** Payout Vault PDA: seeds = ["payout_vault", vault_state_pda] */
export const [payoutVaultPda] = PublicKey.findProgramAddressSync(
  [Buffer.from(PAYOUT_VAULT_SEED), vaultStatePda.toBuffer()],
  PROGRAM_ID,
);

// ---------------------------------------------------------------------------
// getVaultBalance
// ---------------------------------------------------------------------------

export interface VaultTokenBalance {
  mint: string;
  symbol: 'USDC' | 'USDT' | 'USD1';
  balance: string;
  balanceUi: number;
}

/**
 * Returns the USDC, USDT and USD1 token account balances held by the
 * PDA payout vault.
 */
export async function getVaultBalance(): Promise<VaultTokenBalance[]> {
  const results: VaultTokenBalance[] = [];

  const entries = [
    { symbol: 'USDC' as const, mintStr: mints.USDC },
    { symbol: 'USDT' as const, mintStr: mints.USDT },
    { symbol: 'USD1' as const, mintStr: mints.USD1 },
  ];

  await Promise.all(
    entries
      .filter((e): e is { symbol: 'USDC' | 'USDT' | 'USD1'; mintStr: string } =>
        e.mintStr !== null,
      )
      .map(async ({ symbol, mintStr }) => {
        const mint = new PublicKey(mintStr);
        const ata = await getAssociatedTokenAddress(mint, payoutVaultPda, true);

        try {
          const account = await getAccount(connection, ata);
          const balance = account.amount;
          results.push({
            mint: mintStr,
            symbol,
            balance: balance.toString(),
            balanceUi: Number(balance) / 1_000_000,
          });
        } catch (err) {
          if (err instanceof TokenAccountNotFoundError) {
            results.push({ mint: mintStr, symbol, balance: '0', balanceUi: 0 });
          } else {
            throw err;
          }
        }
      }),
  );

  return results;
}

// ---------------------------------------------------------------------------
// Discriminators for v2 instructions
// ---------------------------------------------------------------------------

function disc(name: string): Buffer {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

const SUBMIT_RESULT_NO_PAYOUT_DISC = disc('submit_result_no_payout');
const SUBMIT_RESULT_WITH_PAYOUT_DISC = disc('submit_result_with_payout');
const PROCESS_HEARTBEAT_OPEN_DISC = disc('process_heartbeat_open');
const PROCESS_PAYOUT_DISC = disc('process_payout');
const PROCESS_HEARTBEAT_CLOSE_DISC = disc('process_heartbeat_close');
const FORCE_CLOSE_TRADER_ACCOUNT_DISC = disc('force_close_trader_account');

// ---------------------------------------------------------------------------
// Phase number mapping (matches on-chain Phase enum)
// ---------------------------------------------------------------------------

/**
 * Maps a trader's passed-attempt count to the on-chain Phase enum number.
 * passedCount 0 = Evaluation (phase 0)
 * passedCount 1 = Funded1 (phase 1)
 * ...
 * passedCount 5 = Funded5 (phase 5)
 */
export function phaseNumber(passedCount: number): number {
  return Math.min(Math.max(passedCount, 0), 5);
}

// ---------------------------------------------------------------------------
// PhaseResultData
// ---------------------------------------------------------------------------

export interface PhaseResultData {
  startingBalance: number;    // USDC smallest units (6 decimals)
  endingBalance: number;
  realizedPnl: number;        // can be negative
  totalTrades: number;
  winningTrades: number;
  maxDrawdownUsedBps: number; // e.g. 450 = 4.5%
  drawdownModeAtEnd: number;  // 0 = static, 1 = trailing
  peakBalance: number;
  resultHash: Buffer;         // 32 bytes
}

// ---------------------------------------------------------------------------
// submitResultNoPayoutOnChain
// ---------------------------------------------------------------------------

/**
 * Calls submit_result_no_payout on-chain.
 * Used for: eval pass, eval fail, funded fail.
 */
export async function submitResultNoPayoutOnChain(params: {
  traderWallet: string;
  passed: boolean;
  currentPhaseNumber: number;
  phaseData: PhaseResultData;
}): Promise<string | null> {
  const { traderWallet, passed, currentPhaseNumber, phaseData } = params;

  try {
    const traderPubkey = new PublicKey(traderWallet);

    const [traderAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(TRADER_ACCOUNT_SEED), traderPubkey.toBuffer()],
      PROGRAM_ID,
    );
    const [phaseResultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(PHASE_RESULT_SEED), traderPubkey.toBuffer(), Buffer.from([currentPhaseNumber])],
      PROGRAM_ID,
    );

    const data = Buffer.alloc(8 + 1 + 8 + 8 + 8 + 4 + 4 + 2 + 1 + 8 + 32);
    let offset = 0;

    SUBMIT_RESULT_NO_PAYOUT_DISC.copy(data, offset); offset += 8;
    data.writeUInt8(passed ? 1 : 0, offset); offset += 1;
    data.writeBigUInt64LE(BigInt(Math.max(0, phaseData.startingBalance)), offset); offset += 8;
    data.writeBigUInt64LE(BigInt(Math.max(0, phaseData.endingBalance)), offset); offset += 8;
    data.writeBigInt64LE(BigInt(phaseData.realizedPnl), offset); offset += 8;
    data.writeUInt32LE(phaseData.totalTrades, offset); offset += 4;
    data.writeUInt32LE(phaseData.winningTrades, offset); offset += 4;
    data.writeUInt16LE(phaseData.maxDrawdownUsedBps, offset); offset += 2;
    data.writeUInt8(phaseData.drawdownModeAtEnd, offset); offset += 1;
    data.writeBigUInt64LE(BigInt(Math.max(0, phaseData.peakBalance)), offset); offset += 8;
    phaseData.resultHash.copy(data, offset);

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: vaultStatePda, isSigner: false, isWritable: false },
        { pubkey: traderAccountPda, isSigner: false, isWritable: true },
        { pubkey: phaseResultPda, isSigner: false, isWritable: true },
        { pubkey: protocolKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = protocolKeypair.publicKey;

    const sig = await sendAndConfirmTransaction(connection, tx, [protocolKeypair], {
      commitment: 'confirmed',
    });

    logger.info(
      { sig, traderWallet, passed, phase: currentPhaseNumber },
      '[solana] submit_result_no_payout on-chain',
    );
    return sig;
  } catch (err) {
    logger.error(
      { err: (err as Error).message, traderWallet, passed },
      '[solana] Failed submit_result_no_payout',
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// submitResultWithPayoutOnChain
// ---------------------------------------------------------------------------

/**
 * Calls submit_result_with_payout on-chain.
 * Used for: funded pass ONLY. Auto-queues payout at 8%.
 */
export async function submitResultWithPayoutOnChain(params: {
  traderWallet: string;
  currentPhaseNumber: number;
  phaseData: PhaseResultData;
}): Promise<string | null> {
  const { traderWallet, currentPhaseNumber, phaseData } = params;

  try {
    const traderPubkey = new PublicKey(traderWallet);

    const [traderAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(TRADER_ACCOUNT_SEED), traderPubkey.toBuffer()],
      PROGRAM_ID,
    );
    const [phaseResultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(PHASE_RESULT_SEED), traderPubkey.toBuffer(), Buffer.from([currentPhaseNumber])],
      PROGRAM_ID,
    );
    const [payoutRequestPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(PAYOUT_REQUEST_SEED), traderPubkey.toBuffer(), Buffer.from([currentPhaseNumber])],
      PROGRAM_ID,
    );

    const data = Buffer.alloc(8 + 8 + 8 + 8 + 4 + 4 + 2 + 1 + 8 + 32);
    let offset = 0;

    SUBMIT_RESULT_WITH_PAYOUT_DISC.copy(data, offset); offset += 8;
    data.writeBigUInt64LE(BigInt(Math.max(0, phaseData.startingBalance)), offset); offset += 8;
    data.writeBigUInt64LE(BigInt(Math.max(0, phaseData.endingBalance)), offset); offset += 8;
    data.writeBigInt64LE(BigInt(phaseData.realizedPnl), offset); offset += 8;
    data.writeUInt32LE(phaseData.totalTrades, offset); offset += 4;
    data.writeUInt32LE(phaseData.winningTrades, offset); offset += 4;
    data.writeUInt16LE(phaseData.maxDrawdownUsedBps, offset); offset += 2;
    data.writeUInt8(phaseData.drawdownModeAtEnd, offset); offset += 1;
    data.writeBigUInt64LE(BigInt(Math.max(0, phaseData.peakBalance)), offset); offset += 8;
    phaseData.resultHash.copy(data, offset);

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: vaultStatePda, isSigner: false, isWritable: true },
        { pubkey: traderAccountPda, isSigner: false, isWritable: true },
        { pubkey: phaseResultPda, isSigner: false, isWritable: true },
        { pubkey: payoutRequestPda, isSigner: false, isWritable: true },
        { pubkey: protocolKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = protocolKeypair.publicKey;

    const sig = await sendAndConfirmTransaction(connection, tx, [protocolKeypair], {
      commitment: 'confirmed',
    });

    logger.info(
      { sig, traderWallet, phase: currentPhaseNumber },
      '[solana] submit_result_with_payout on-chain — payout auto-queued',
    );
    return sig;
  } catch (err) {
    logger.error(
      { err: (err as Error).message, traderWallet },
      '[solana] Failed submit_result_with_payout',
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Heartbeat functions (permissionless — but backend calls them as default)
// ---------------------------------------------------------------------------

/**
 * Calls process_heartbeat_open — opens the 5-day payout window.
 */
export async function processHeartbeatOpen(): Promise<string | null> {
  try {
    const vaultAta = await getAssociatedTokenAddress(
      new PublicKey(mints.USDC),
      payoutVaultPda,
      true,
    );

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: vaultStatePda, isSigner: false, isWritable: true },
        { pubkey: vaultAta, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(PROCESS_HEARTBEAT_OPEN_DISC),
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = protocolKeypair.publicKey;

    const sig = await sendAndConfirmTransaction(connection, tx, [protocolKeypair], {
      commitment: 'confirmed',
    });

    logger.info({ sig }, '[solana] Heartbeat opened');
    return sig;
  } catch (err) {
    logger.error({ err: (err as Error).message }, '[solana] Failed to open heartbeat');
    return null;
  }
}

/**
 * Calls process_payout for a single queued payout.
 */
export async function processQueuedPayout(params: {
  traderWallet: string;
  phaseNumber: number;
}): Promise<string | null> {
  const { traderWallet, phaseNumber: phase } = params;

  try {
    const traderPubkey = new PublicKey(traderWallet);
    const mintPubkey = new PublicKey(mints.USDC);

    const [traderAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(TRADER_ACCOUNT_SEED), traderPubkey.toBuffer()],
      PROGRAM_ID,
    );
    const [payoutRequestPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(PAYOUT_REQUEST_SEED), traderPubkey.toBuffer(), Buffer.from([phase])],
      PROGRAM_ID,
    );

    const vaultAta = await getAssociatedTokenAddress(mintPubkey, payoutVaultPda, true);
    const traderAta = await getAssociatedTokenAddress(mintPubkey, traderPubkey, true);

    const tx = new Transaction();

    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        protocolKeypair.publicKey,
        traderAta,
        traderPubkey,
        mintPubkey,
      ),
    );

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: vaultStatePda, isSigner: false, isWritable: true },
        { pubkey: payoutRequestPda, isSigner: false, isWritable: true },
        { pubkey: traderAccountPda, isSigner: false, isWritable: true },
        { pubkey: payoutVaultPda, isSigner: false, isWritable: false },
        { pubkey: vaultAta, isSigner: false, isWritable: true },
        { pubkey: traderAta, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(PROCESS_PAYOUT_DISC),
    });

    tx.add(ix);
    tx.feePayer = protocolKeypair.publicKey;

    const sig = await sendAndConfirmTransaction(connection, tx, [protocolKeypair], {
      commitment: 'confirmed',
    });

    logger.info({ sig, traderWallet, phase }, '[solana] Payout processed');
    return sig;
  } catch (err) {
    logger.error(
      { err: (err as Error).message, traderWallet, phase },
      '[solana] Failed to process payout',
    );
    return null;
  }
}

/**
 * Calls process_heartbeat_close — closes the payout window.
 */
export async function processHeartbeatClose(): Promise<string | null> {
  try {
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: vaultStatePda, isSigner: false, isWritable: true },
      ],
      data: Buffer.from(PROCESS_HEARTBEAT_CLOSE_DISC),
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = protocolKeypair.publicKey;

    const sig = await sendAndConfirmTransaction(connection, tx, [protocolKeypair], {
      commitment: 'confirmed',
    });

    logger.info({ sig }, '[solana] Heartbeat closed');
    return sig;
  } catch (err) {
    logger.error({ err: (err as Error).message }, '[solana] Failed to close heartbeat');
    return null;
  }
}

// ---------------------------------------------------------------------------
// forceCloseTraderAccount (devnet helper)
// ---------------------------------------------------------------------------

/**
 * Calls force_close_trader_account — admin-only devnet helper that closes a
 * TraderAccount PDA and returns its lamports to the admin wallet.
 */
export async function forceCloseTraderAccount(
  traderWallet: string,
): Promise<string> {
  const traderPubkey = new PublicKey(traderWallet);

  const [traderAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(TRADER_ACCOUNT_SEED), traderPubkey.toBuffer()],
    PROGRAM_ID,
  );

  const data = Buffer.concat([
    FORCE_CLOSE_TRADER_ACCOUNT_DISC,
    traderPubkey.toBuffer(),
  ]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: vaultStatePda, isSigner: false, isWritable: false },
      { pubkey: traderAccountPda, isSigner: false, isWritable: true },
      { pubkey: protocolKeypair.publicKey, isSigner: true, isWritable: true },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = protocolKeypair.publicKey;

  const sig = await sendAndConfirmTransaction(connection, tx, [protocolKeypair], {
    commitment: 'confirmed',
  });

  logger.info({ sig, traderWallet }, '[solana] trader account force-closed');
  return sig;
}

// ---------------------------------------------------------------------------
// buildResultHash
// ---------------------------------------------------------------------------

export function buildResultHash(params: {
  traderWallet: string;
  startingBalance: number;
  endingBalance: number;
  realizedPnl: number;
  totalTrades: number;
  passed: boolean;
}): Buffer {
  const data = Buffer.concat([
    new PublicKey(params.traderWallet).toBuffer(),
    Buffer.from(new BigUint64Array([BigInt(Math.max(0, params.startingBalance))]).buffer),
    Buffer.from(new BigUint64Array([BigInt(Math.max(0, params.endingBalance))]).buffer),
    Buffer.from(new BigInt64Array([BigInt(params.realizedPnl)]).buffer),
    Buffer.from(new Uint32Array([params.totalTrades]).buffer),
    Buffer.from([params.passed ? 1 : 0]),
  ]);
  return createHash('sha256').update(data).digest();
}

// ---------------------------------------------------------------------------
// confirmTransaction
// ---------------------------------------------------------------------------

export async function confirmTransaction(signature: TransactionSignature): Promise<void> {
  const TIMEOUT_MS = 60_000;
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    const status = await connection.getSignatureStatus(signature, {
      searchTransactionHistory: true,
    });

    if (status.value?.err) {
      throw new Error(
        `[solana] Transaction ${signature} failed: ${JSON.stringify(status.value.err)}`,
      );
    }

    if (status.value?.confirmationStatus === 'finalized') {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }

  throw new Error(
    `[solana] Transaction ${signature} did not finalize within ${TIMEOUT_MS / 1000}s`,
  );
}
