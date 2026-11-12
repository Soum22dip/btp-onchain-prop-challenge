/**
 * One-shot devnet bootstrap for a freshly deployed setl8-vault program.
 *
 *   pnpm exec tsx scripts/redeploy-devnet.ts <admin-keypair.json> <program-id> [rpc-url]
 *
 * Does, in order (idempotent where possible):
 *   1. creates a test USDC mint (6 decimals, mint authority = admin)
 *   2. initialize(): admin = protocol wallet = the signing keypair
 *   3. creates the payout-vault token account (ATA of the payout_vault PDA)
 *   4. mints 100,000 test USDC to admin and admin_deposit()s it into the vault
 * Prints the env values / constants to update. Never prints secret keys.
 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  TransactionInstruction, sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID, createMint, getOrCreateAssociatedTokenAccount, mintTo,
} from '@solana/spl-token';

const [keypairPath, programIdArg, rpcArg] = process.argv.slice(2);
if (!keypairPath || !programIdArg) {
  console.error('usage: tsx scripts/redeploy-devnet.ts <admin-keypair.json> <program-id> [rpc-url]');
  process.exit(1);
}
const RPC = rpcArg || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(programIdArg);
const FEE_SPLIT_PROTOCOL_BPS = 3500; // 35%
const TRADER_RESERVE_BPS = 2500;     // 25%
const DECIMALS = 6;
const FUND_USDC = 100_000n;

const disc = (name: string) =>
  createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u64 = (n: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b; };

async function main() {
  const admin = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')) as number[]),
  );
  const conn = new Connection(RPC, 'confirmed');
  console.log('Admin = protocol wallet:', admin.publicKey.toBase58());
  console.log('Program:                ', PROGRAM_ID.toBase58());
  console.log('Balance (SOL):          ', (await conn.getBalance(admin.publicKey)) / 1e9);

  const prog = await conn.getAccountInfo(PROGRAM_ID);
  if (!prog || !prog.executable) throw new Error('Program is not deployed at that address on this cluster');

  const [vaultState] = PublicKey.findProgramAddressSync([Buffer.from('vault_state')], PROGRAM_ID);
  const [payoutVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('payout_vault'), vaultState.toBuffer()], PROGRAM_ID);

  // 1. test USDC mint
  console.log('\n[1/4] creating test USDC mint...');
  const mint = await createMint(conn, admin, admin.publicKey, admin.publicKey, DECIMALS);
  console.log('      mint:', mint.toBase58());

  // 2. initialize
  console.log('[2/4] initialize vault...');
  const existing = await conn.getAccountInfo(vaultState);
  if (existing && existing.data.length > 0 && existing.data[0] !== 0) {
    throw new Error('VaultState already exists for this program — use a fresh program ID');
  }
  const mintsVec = Buffer.concat([
    (() => { const b = Buffer.alloc(4); b.writeUInt32LE(1); return b; })(), mint.toBuffer(),
  ]);
  const initData = Buffer.concat([
    disc('initialize'), admin.publicKey.toBuffer(), mintsVec,
    u16(FEE_SPLIT_PROTOCOL_BPS), u16(TRADER_RESERVE_BPS),
  ]);
  const initIx = new TransactionInstruction({
    programId: PROGRAM_ID, data: initData,
    keys: [
      { pubkey: vaultState, isSigner: false, isWritable: true },
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });
  const initSig = await sendAndConfirmTransaction(conn, new Transaction().add(initIx), [admin]);
  console.log('      tx:', initSig);

  // 3. payout vault token account (ATA of the PDA)
  console.log('[3/4] creating payout-vault token account...');
  const vaultAta = await getOrCreateAssociatedTokenAccount(
    conn, admin, mint, payoutVaultPda, true);
  console.log('      ATA:', vaultAta.address.toBase58());

  // 4. mint + admin_deposit
  console.log('[4/4] funding vault with test USDC...');
  const adminAta = await getOrCreateAssociatedTokenAccount(conn, admin, mint, admin.publicKey);
  const amount = FUND_USDC * 10n ** BigInt(DECIMALS);
  await mintTo(conn, admin, mint, adminAta.address, admin, amount);
  const depIx = new TransactionInstruction({
    programId: PROGRAM_ID, data: Buffer.concat([disc('admin_deposit'), u64(amount)]),
    keys: [
      { pubkey: vaultState, isSigner: false, isWritable: false },
      { pubkey: admin.publicKey, isSigner: true, isWritable: false },
      { pubkey: adminAta.address, isSigner: false, isWritable: true },
      { pubkey: vaultAta.address, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });
  const depSig = await sendAndConfirmTransaction(conn, new Transaction().add(depIx), [admin]);
  console.log('      tx:', depSig);

  console.log('\n================ DONE — values to use ================');
  console.log('VAULT_PROGRAM_ID      =', PROGRAM_ID.toBase58());
  console.log('PROTOCOL_WALLET       =', admin.publicKey.toBase58());
  console.log('USDC_DEVNET_MINT      =', mint.toBase58());
  console.log('PAYOUT_VAULT_PDA      =', payoutVaultPda.toBase58());
  console.log('PAYOUT_VAULT_ATA      =', vaultAta.address.toBase58());
  console.log('VAULT_STATE_PDA       =', vaultState.toBase58());
}

main().catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
