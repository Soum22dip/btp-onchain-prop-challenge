// =============================================================================
// Setl8 — Devnet Setup Script
//
// Creates a test USDC mint, funds the payout vault with 100,000 USDC,
// and creates token accounts for test wallets.
//
// Usage:  from the repository root: npx tsx scripts/setup-devnet.ts
// =============================================================================

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from '@solana/spl-token';
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const PROTOCOL_KEYPAIR_PATH = `${process.env.HOME}/.config/solana/id.json`;
const PAYOUT_VAULT_KEYPAIR_PATH = `${process.env.HOME}/.config/solana/payout-vault.json`;

const USDC_DECIMALS = 6;
const VAULT_FUND_AMOUNT = 100_000; // $100,000 test USDC

// Test trader wallets to create ATAs for
const TEST_TRADERS = [
  'H3UqmLrUGNxVEya7LrW4QFN7yxGwaWsjxc9EpsR1WndS', // dev test wallet
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadKeypair(path: string): Keypair {
  const raw = fs.readFileSync(path, 'utf-8');
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
}

function log(msg: string): void {
  console.log(`  ${msg}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n=== Setl8 Devnet Setup ===\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const protocolKeypair = loadKeypair(PROTOCOL_KEYPAIR_PATH);
  const vaultKeypair = loadKeypair(PAYOUT_VAULT_KEYPAIR_PATH);

  log(`Protocol wallet: ${protocolKeypair.publicKey.toBase58()}`);
  log(`Payout vault:    ${vaultKeypair.publicKey.toBase58()}`);

  // Check SOL balance
  const protocolBalance = await connection.getBalance(protocolKeypair.publicKey);
  const vaultBalance = await connection.getBalance(vaultKeypair.publicKey);
  log(`Protocol SOL:    ${(protocolBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  log(`Vault SOL:       ${(vaultBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  // Airdrop SOL to vault if needed (for ATA creation rent)
  if (vaultBalance < 0.05 * LAMPORTS_PER_SOL) {
    log('Vault needs SOL for rent — requesting airdrop...');
    try {
      const sig = await connection.requestAirdrop(
        vaultKeypair.publicKey,
        1 * LAMPORTS_PER_SOL,
      );
      await connection.confirmTransaction(sig, 'confirmed');
      log('Airdropped 1 SOL to vault');
    } catch (e) {
      log(`Airdrop failed (rate limit?) — transferring 0.1 SOL from protocol wallet`);
      const { Transaction, SystemProgram } = await import('@solana/web3.js');
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: protocolKeypair.publicKey,
          toPubkey: vaultKeypair.publicKey,
          lamports: Math.floor(0.1 * LAMPORTS_PER_SOL),
        }),
      );
      await connection.sendTransaction(tx, [protocolKeypair]);
      log('Transferred 0.1 SOL from protocol to vault');
    }
  }

  // -------------------------------------------------------------------------
  // Step 1: Create test USDC mint
  // -------------------------------------------------------------------------
  console.log('\n--- Step 1: Create test USDC mint ---');

  const mint = await createMint(
    connection,
    protocolKeypair,       // payer
    protocolKeypair.publicKey, // mint authority
    protocolKeypair.publicKey, // freeze authority
    USDC_DECIMALS,
  );

  log(`Test USDC mint: ${mint.toBase58()}`);

  // -------------------------------------------------------------------------
  // Step 2: Create vault token account and fund with 100,000 USDC
  // -------------------------------------------------------------------------
  console.log('\n--- Step 2: Fund payout vault ---');

  const vaultAta = await getOrCreateAssociatedTokenAccount(
    connection,
    protocolKeypair,       // payer for ATA creation
    mint,
    vaultKeypair.publicKey,
  );

  log(`Vault ATA: ${vaultAta.address.toBase58()}`);

  const mintAmount = BigInt(VAULT_FUND_AMOUNT) * BigInt(10 ** USDC_DECIMALS);

  await mintTo(
    connection,
    protocolKeypair,       // payer
    mint,
    vaultAta.address,
    protocolKeypair,       // mint authority
    mintAmount,
  );

  const vaultAccount = await getAccount(connection, vaultAta.address);
  log(`Vault balance: ${Number(vaultAccount.amount) / 10 ** USDC_DECIMALS} USDC`);

  // -------------------------------------------------------------------------
  // Step 3: Create trader ATAs
  // -------------------------------------------------------------------------
  console.log('\n--- Step 3: Create trader token accounts ---');

  for (const trader of TEST_TRADERS) {
    try {
      const traderPubkey = new PublicKey(trader);
      const traderAta = await getOrCreateAssociatedTokenAccount(
        connection,
        protocolKeypair, // payer
        mint,
        traderPubkey,
      );
      log(`Trader ${trader.slice(0, 8)}... ATA: ${traderAta.address.toBase58()}`);
    } catch (e) {
      log(`Failed to create ATA for ${trader}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n=== Setup Complete ===\n');
  console.log('Add to backend/.env:');
  console.log(`  USDC_DEVNET_MINT="${mint.toBase58()}"`);
  console.log(`  VAULT_PROGRAM_ID="C3bvX2hkL76wXNobbyJPV5JpEPRFc3ksA4khR8WU9Rnk"`);
  console.log('');
  console.log('Addresses:');
  console.log(`  Test USDC mint:   ${mint.toBase58()}`);
  console.log(`  Vault ATA:        ${vaultAta.address.toBase58()}`);
  console.log(`  Vault balance:    ${VAULT_FUND_AMOUNT.toLocaleString()} USDC`);
  console.log(`  Protocol wallet:  ${protocolKeypair.publicKey.toBase58()}`);
  console.log(`  Payout vault:     ${vaultKeypair.publicKey.toBase58()}`);
  console.log('');
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
