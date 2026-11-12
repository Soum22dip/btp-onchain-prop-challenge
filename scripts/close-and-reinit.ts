// =============================================================================
// Setl8 — Close old VaultState, Reinitialize, Transfer Admin
//
// 1. force_close_vault_state (drains old PDA)
// 2. initialize (creates new PDA with correct layout)
// 3. transfer_admin (old admin → new admin)
// 4. Create ATAs for admin and PDA vault
//
// Usage: NODE_OPTIONS="--max-old-space-size=8192" npx tsx scripts/close-and-reinit.ts
// =============================================================================

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';
import fs from 'node:fs';

const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const OLD_ADMIN_PATH = `${process.env.HOME}/.config/solana/admin.json`;
const FEE_PAYER_PATH = `${process.env.HOME}/.config/solana/id.json`;
const NEW_ADMIN = new PublicKey('9Ru75YJUUSaXdEaP9FRmeUzwZDCbWWDYE5THKnwbYSr7');
const PROGRAM_ID = new PublicKey('C3bvX2hkL76wXNobbyJPV5JpEPRFc3ksA4khR8WU9Rnk');
const TEST_USDC_MINT = new PublicKey('ivFfzaEFj6fAePeU2W6kum6fXUuy2qH5hDkr74R8STG');

const FORCE_CLOSE_DISC = Buffer.from([45, 185, 191, 231, 19, 228, 62, 239]);
const INITIALIZE_DISC = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);
const TRANSFER_ADMIN_DISC = Buffer.from([42, 242, 66, 106, 228, 10, 111, 156]);

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, 'utf-8')) as number[]));
}

function log(msg: string) { console.log(`  ${msg}`); }

async function main() {
  console.log('\n=== Close Old VaultState + Reinitialize + Transfer Admin ===\n');

  const conn = new Connection(RPC_URL, 'confirmed');
  const onChainAdmin = loadKeypair(OLD_ADMIN_PATH); // admin.json = 9Ru75... (on-chain admin)
  const feePayer = loadKeypair(FEE_PAYER_PATH);     // id.json = 5tkY... (has SOL)
  const [vaultStatePda] = PublicKey.findProgramAddressSync([Buffer.from('vault_state')], PROGRAM_ID);
  const [payoutVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('payout_vault'), vaultStatePda.toBuffer()], PROGRAM_ID);

  log(`On-chain admin:   ${onChainAdmin.publicKey.toBase58()}`);
  log(`Fee payer:        ${feePayer.publicKey.toBase58()}`);
  log(`VaultState PDA:   ${vaultStatePda.toBase58()}`);
  log(`Payout Vault PDA: ${payoutVaultPda.toBase58()}`);

  // Step 1: Force close old VaultState
  const existing = await conn.getAccountInfo(vaultStatePda);
  if (existing) {
    console.log('\n--- Step 1: Force close old VaultState ---');
    log(`Account size: ${existing.data.length}, lamports: ${existing.lamports}`);

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: vaultStatePda, isSigner: false, isWritable: true },
        { pubkey: onChainAdmin.publicKey, isSigner: true, isWritable: true },
      ],
      data: FORCE_CLOSE_DISC,
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = feePayer.publicKey;
    const sig = await sendAndConfirmTransaction(conn, tx, [feePayer, onChainAdmin], { commitment: 'confirmed' });
    log(`Closed: ${sig}`);

    // Verify it's gone
    const check = await conn.getAccountInfo(vaultStatePda);
    log(`Account after close: ${check ? `${check.data.length} bytes` : 'NULL (closed)'}`);
  } else {
    log('VaultState PDA does not exist — skipping close');
  }

  // Step 2: Initialize with new layout
  console.log('\n--- Step 2: Initialize ---');

  // Build initialize data:
  // disc(8) + protocol_wallet(32) + supported_mints vec(4 len + 32 * n) + min_trades(4) + max_payout_bps(2) + max_cum_bps(2) + min_payout_amt(8) + fee_split_bps(2) + trader_reserve_bps(2)
  const mintCount = 1;
  const dataLen = 8 + 32 + (4 + 32 * mintCount) + 4 + 2 + 2 + 8 + 2 + 2;
  const data = Buffer.alloc(dataLen);
  let offset = 0;

  // Discriminator
  INITIALIZE_DISC.copy(data, offset); offset += 8;
  // protocol_wallet
  Buffer.from(NEW_ADMIN.toBytes()).copy(data, offset); offset += 32;
  // supported_mints vec: length prefix + mint bytes
  data.writeUInt32LE(mintCount, offset); offset += 4;
  Buffer.from(TEST_USDC_MINT.toBytes()).copy(data, offset); offset += 32;
  // min_trades_to_pass: u32
  data.writeUInt32LE(5, offset); offset += 4;
  // max_payout_bps: u16
  data.writeUInt16LE(800, offset); offset += 2;
  // max_cumulative_payout_bps: u16
  data.writeUInt16LE(4000, offset); offset += 2;
  // min_payout_amount: u64
  data.writeBigUInt64LE(BigInt(10_000_000), offset); offset += 8;
  // fee_split_protocol_bps: u16
  data.writeUInt16LE(3500, offset); offset += 2;
  // trader_reserve_bps: u16
  data.writeUInt16LE(2500, offset); offset += 2;

  const initIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: vaultStatePda, isSigner: false, isWritable: true },
      { pubkey: feePayer.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const initTx = new Transaction().add(initIx);
  initTx.feePayer = feePayer.publicKey;
  const initSig = await sendAndConfirmTransaction(conn, initTx, [feePayer], { commitment: 'confirmed' });
  log(`Initialized: ${initSig}`);

  // Verify
  const newAccount = await conn.getAccountInfo(vaultStatePda);
  if (newAccount) {
    const admin = new PublicKey(newAccount.data.subarray(8, 40));
    const protocolWallet = new PublicKey(newAccount.data.subarray(40, 72));
    log(`On-chain admin:           ${admin.toBase58()}`);
    log(`On-chain protocol_wallet: ${protocolWallet.toBase58()}`);
    log(`Account size:             ${newAccount.data.length} bytes`);
  }

  // Step 3: Transfer admin
  console.log('\n--- Step 3: Transfer admin ---');

  const transferData = Buffer.alloc(8 + 32);
  TRANSFER_ADMIN_DISC.copy(transferData, 0);
  Buffer.from(NEW_ADMIN.toBytes()).copy(transferData, 8);

  const transferIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: vaultStatePda, isSigner: false, isWritable: true },
      { pubkey: feePayer.publicKey, isSigner: true, isWritable: false },
    ],
    data: transferData,
  });

  const transferTx = new Transaction().add(transferIx);
  transferTx.feePayer = feePayer.publicKey;
  const transferSig = await sendAndConfirmTransaction(conn, transferTx, [feePayer], { commitment: 'confirmed' });
  log(`Transfer admin: ${transferSig}`);

  // Verify
  const finalAccount = await conn.getAccountInfo(vaultStatePda);
  if (finalAccount) {
    const finalAdmin = new PublicKey(finalAccount.data.subarray(8, 40));
    log(`Final admin on-chain: ${finalAdmin.toBase58()}`);
    if (finalAdmin.equals(NEW_ADMIN)) {
      log('✅ Admin transfer successful!');
    } else {
      log('❌ Admin mismatch!');
    }
  }

  // Step 4: Create ATAs
  console.log('\n--- Step 4: Create ATAs ---');

  const adminAta = await getOrCreateAssociatedTokenAccount(conn, feePayer, TEST_USDC_MINT, NEW_ADMIN);
  log(`Admin ATA:     ${adminAta.address.toBase58()}`);

  const vaultAta = await getOrCreateAssociatedTokenAccount(conn, feePayer, TEST_USDC_MINT, payoutVaultPda, true);
  log(`Vault PDA ATA: ${vaultAta.address.toBase58()}`);

  console.log('\n=== Done ===\n');
  console.log(`  Program ID:       ${PROGRAM_ID.toBase58()}`);
  console.log(`  VaultState PDA:   ${vaultStatePda.toBase58()}`);
  console.log(`  Payout Vault PDA: ${payoutVaultPda.toBase58()}`);
  console.log(`  Admin:            ${NEW_ADMIN.toBase58()}`);
  console.log(`  Fee split:        35% admin / 65% vault`);
  console.log('');
}

main().catch((err) => { console.error('\nFailed:', err); process.exit(1); });
