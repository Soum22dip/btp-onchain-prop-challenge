// =============================================================================
// Setl8 — Reset TraderAccount PDA
//
// Calls submit_result on-chain to mark a trader's current attempt as Failed,
// allowing them to start a new challenge.
//
// Usage: npx tsx scripts/reset-trader-pda.ts <WALLET_ADDRESS>
// =============================================================================

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { createHash, createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// Resolve @prisma/client from the backend workspace where it's generated
const backendRequire = createRequire(
  path.resolve(process.cwd(), 'backend', 'package.json'),
);
const { PrismaClient } = backendRequire('@prisma/client') as typeof import('@prisma/client');

const RPC_URL =
  process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(
  'C3bvX2hkL76wXNobbyJPV5JpEPRFc3ksA4khR8WU9Rnk',
);
const ADMIN_KEYPAIR_PATH = `${process.env.HOME}/.config/solana/admin.json`;
const MIN_TRADES = 5; // must match on-chain min_trades_to_pass

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage:\n  npx tsx scripts/reset-trader-pda.ts <WALLET_ADDRESS>\n  npx tsx scripts/reset-trader-pda.ts --clean-test-data');
    process.exit(1);
  }

  // ------------------------------------------------------------------
  // --clean-test-data: delete all test traders from DB
  // ------------------------------------------------------------------
  if (arg === '--clean-test-data') {
    const realWallets = ['DDGmZgDHGFSRbVWefo3Cjfr8c1pQyooyo71izvcVgp5V'];

    const prisma = new PrismaClient();
    try {
      const testTraders = await prisma.trader.findMany({
        where: { walletAddress: { notIn: realWallets } },
        select: { id: true, walletAddress: true },
      });

      console.log(`Found ${testTraders.length} test traders to delete`);

      for (const t of testTraders) {
        const snaps = await prisma.attemptSnapshot.deleteMany({ where: { attempt: { traderId: t.id } } });
        const pos = await prisma.position.deleteMany({ where: { traderId: t.id } });
        const pay = await prisma.payoutRequest.deleteMany({ where: { traderId: t.id } });
        const att = await prisma.attempt.deleteMany({ where: { traderId: t.id } });
        await prisma.trader.delete({ where: { id: t.id } });
        console.log(`  Deleted ${t.walletAddress} (${att.count} attempts, ${pos.count} positions, ${pay.count} payouts, ${snaps.count} snapshots)`);
      }

      console.log('\nTest data cleaned. Only real wallets remain.');
    } finally {
      await prisma.$disconnect();
    }
    process.exit(0);
  }

  // ------------------------------------------------------------------
  // Normal mode: reset a specific trader by wallet address
  // ------------------------------------------------------------------
  const traderWallet = arg;

  const connection = new Connection(RPC_URL, 'confirmed');
  const adminKeypair = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(fs.readFileSync(ADMIN_KEYPAIR_PATH, 'utf-8')) as number[],
    ),
  );

  const traderPubkey = new PublicKey(traderWallet);
  const [vaultStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_state')],
    PROGRAM_ID,
  );
  const [traderAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('trader'), traderPubkey.toBuffer()],
    PROGRAM_ID,
  );

  console.log(`Resetting TraderAccount PDA for ${traderWallet}`);
  console.log(`  TraderAccount PDA: ${traderAccountPda.toBase58()}`);
  console.log(`  Admin: ${adminKeypair.publicKey.toBase58()}`);

  // Build submit_result with passed=false, finalBalance=0
  const resultData = Buffer.concat([
    traderPubkey.toBuffer(),
    Buffer.from(new BigUint64Array([BigInt(0)]).buffer),
    Buffer.from(new Uint32Array([MIN_TRADES]).buffer),
    Buffer.from([0]), // passed = false
  ]);
  const resultHash = createHash('sha256').update(resultData).digest();
  const proof = createHmac('sha256', 'setl8-result-secret')
    .update(resultData)
    .digest();

  // Anchor discriminator: SHA256("global:submit_result")[0..8]
  const discriminator = createHash('sha256')
    .update('global:submit_result')
    .digest()
    .subarray(0, 8);

  // Instruction data: disc(8) + final_balance(u64,8) + realized_pnl(i64,8) +
  //                   trade_count(u32,4) + result_hash(32) + proof(32)
  const data = Buffer.alloc(8 + 8 + 8 + 4 + 32 + 32);
  let offset = 0;
  Buffer.from(discriminator).copy(data, offset);
  offset += 8;
  data.writeBigUInt64LE(BigInt(0), offset);
  offset += 8; // final_balance = 0
  data.writeBigInt64LE(BigInt(0), offset);
  offset += 8; // realized_pnl = 0
  data.writeUInt32LE(MIN_TRADES, offset);
  offset += 4; // trade_count
  resultHash.copy(data, offset);
  offset += 32;
  proof.copy(data, offset);

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: vaultStatePda, isSigner: false, isWritable: false },
      { pubkey: traderAccountPda, isSigner: false, isWritable: true },
      { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });

  const tx = new Transaction().add(instruction);
  try {
    const sig = await sendAndConfirmTransaction(
      connection,
      tx,
      [adminKeypair],
      { commitment: 'confirmed' },
    );
    console.log(`\nTraderAccount PDA reset. TX: ${sig}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('TraderNotActive') || msg.includes('0x1777')) {
      console.log('\nPDA already reset (not active). Skipping on-chain reset.');
    } else {
      console.log(`\nOn-chain reset failed: ${msg}`);
      console.log('Continuing with DB cleanup...');
    }
  }

  // -------------------------------------------------------------------------
  // 2. Clean database — delete all positions, payouts, attempts for this trader
  // -------------------------------------------------------------------------

  console.log('\nCleaning database...');
  const prisma = new PrismaClient();

  try {
    const trader = await prisma.trader.findUnique({
      where: { walletAddress: traderWallet },
    });

    if (trader) {
      // Delete in dependency order: snapshots, positions, payouts, then attempts
      const snaps = await prisma.attemptSnapshot.deleteMany({
        where: { attempt: { traderId: trader.id } },
      });
      const pos = await prisma.position.deleteMany({
        where: { traderId: trader.id },
      });
      const pay = await prisma.payoutRequest.deleteMany({
        where: { traderId: trader.id },
      });
      const att = await prisma.attempt.deleteMany({
        where: { traderId: trader.id },
      });
      console.log(
        `DB cleaned: ${pos.count} positions, ${pay.count} payouts, ${att.count} attempts, ${snaps.count} snapshots deleted`,
      );
    } else {
      console.log('No trader found in DB (wallet may not have registered yet)');
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log('Trader fully reset — can now buy a new challenge.');
}

main().catch((err: Error) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
