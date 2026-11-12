// =============================================================================
// Setl8 — Transfer Admin Authority
//
// Transfers admin from old wallet (5tkY...) to new wallet (9Ru7...)
// Must be signed by the current admin.
//
// Usage: from the repository root: NODE_OPTIONS="--max-old-space-size=8192" npx tsx scripts/transfer-admin.ts
// =============================================================================

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import fs from 'node:fs';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const OLD_ADMIN_KEYPAIR_PATH = `${process.env.HOME}/.config/solana/id.json`;
const NEW_ADMIN_PUBKEY = new PublicKey('9Ru75YJUUSaXdEaP9FRmeUzwZDCbWWDYE5THKnwbYSr7');
const PROGRAM_ID = new PublicKey('C3bvX2hkL76wXNobbyJPV5JpEPRFc3ksA4khR8WU9Rnk');

// transfer_admin discriminator: SHA256("global:transfer_admin")[0..8]
const TRANSFER_ADMIN_DISC = Buffer.from([42, 242, 66, 106, 228, 10, 111, 156]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadKeypair(filePath: string): Keypair {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
}

function log(msg: string): void {
  console.log(`  ${msg}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n=== Setl8 — Transfer Admin ===\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const oldAdmin = loadKeypair(OLD_ADMIN_KEYPAIR_PATH);

  log(`Old admin:  ${oldAdmin.publicKey.toBase58()}`);
  log(`New admin:  ${NEW_ADMIN_PUBKEY.toBase58()}`);
  log(`Program:    ${PROGRAM_ID.toBase58()}`);

  // Derive VaultState PDA
  const [vaultStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_state')],
    PROGRAM_ID,
  );
  log(`VaultState: ${vaultStatePda.toBase58()}`);

  // Verify old admin is current admin by reading account data
  const accountInfo = await connection.getAccountInfo(vaultStatePda);
  if (!accountInfo) {
    throw new Error('VaultState PDA not found — program not initialized');
  }

  // VaultState layout: 8 (disc) + 32 (admin) + ...
  const currentAdmin = new PublicKey(accountInfo.data.subarray(8, 40));
  log(`Current admin on-chain: ${currentAdmin.toBase58()}`);

  if (!currentAdmin.equals(oldAdmin.publicKey)) {
    throw new Error(
      `Current admin on-chain (${currentAdmin.toBase58()}) does not match old admin keypair (${oldAdmin.publicKey.toBase58()})`,
    );
  }

  // Build transfer_admin instruction
  // Data: discriminator (8) + new_admin pubkey (32)
  const data = Buffer.alloc(8 + 32);
  data.set(TRANSFER_ADMIN_DISC, 0);
  data.set(NEW_ADMIN_PUBKEY.toBytes(), 8);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: vaultStatePda, isSigner: false, isWritable: true },
      { pubkey: oldAdmin.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = oldAdmin.publicKey;

  console.log('\n--- Sending transfer_admin transaction ---');

  const sig = await sendAndConfirmTransaction(connection, tx, [oldAdmin], {
    commitment: 'confirmed',
  });

  log(`TX signature: ${sig}`);

  // Verify the transfer
  const updatedInfo = await connection.getAccountInfo(vaultStatePda);
  if (!updatedInfo) throw new Error('Failed to read VaultState after transfer');

  const newAdmin = new PublicKey(updatedInfo.data.subarray(8, 40));
  log(`New admin on-chain: ${newAdmin.toBase58()}`);

  if (newAdmin.equals(NEW_ADMIN_PUBKEY)) {
    console.log('\n  ✅ Admin transfer successful!\n');
  } else {
    console.error('\n  ❌ Admin transfer FAILED — on-chain admin does not match expected\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nTransfer failed:', err);
  process.exit(1);
});
