// =============================================================================
// Setl8 — Run 3 Demo Transactions on Devnet (PDA Smart Contract)
//
// TX 1: Admin Deposit — seed 100 test USDC into PDA vault
// TX 2: Deposit Evaluation Fee — trader buys $2,500 challenge for 25 USDC
// TX 3: Submit Result — admin marks trader as passed
//
// Usage: from the repository root: npx tsx scripts/devnet-demo-txns.ts
// =============================================================================

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor';
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const FEE_PAYER_KEYPAIR_PATH = `${process.env.HOME}/.config/solana/id.json`;
const ADMIN_KEYPAIR_PATH = `${process.env.HOME}/.config/solana/admin.json`; // on-chain admin (9Ru75...)
const IDL_PATH = path.resolve(__dirname, '../target/idl/setl8_vault.json');

const PROGRAM_ID = new PublicKey('C3bvX2hkL76wXNobbyJPV5JpEPRFc3ksA4khR8WU9Rnk');
const TEST_USDC_MINT = new PublicKey('ivFfzaEFj6fAePeU2W6kum6fXUuy2qH5hDkr74R8STG');

const USDC_DECIMALS = 6;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadKeypair(filePath: string): Keypair {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
}

function usdc(amount: number): BN {
  return new BN(amount * 10 ** USDC_DECIMALS);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n=== Setl8 — 3 Demo Transactions on Devnet ===\n');

  const feePayerKeypair = loadKeypair(FEE_PAYER_KEYPAIR_PATH);
  const adminKeypair = loadKeypair(ADMIN_KEYPAIR_PATH);
  const connection = new Connection(RPC_URL, 'confirmed');
  const wallet = new Wallet(feePayerKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });

  const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf-8'));
  const program = new Program(idl, provider);

  // Derive PDAs
  const [vaultStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_state')],
    PROGRAM_ID,
  );
  const [payoutVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('payout_vault'), vaultStatePda.toBuffer()],
    PROGRAM_ID,
  );

  console.log(`  Fee Payer:        ${feePayerKeypair.publicKey.toBase58()}`);
  console.log(`  Admin (on-chain): ${adminKeypair.publicKey.toBase58()}`);
  console.log(`  VaultState PDA:   ${vaultStatePda.toBase58()}`);
  console.log(`  Payout Vault PDA: ${payoutVaultPda.toBase58()}`);

  // Generate a temporary trader keypair for the demo
  const traderKeypair = Keypair.generate();
  console.log(`  Demo Trader:      ${traderKeypair.publicKey.toBase58()}`);

  // Fund trader and admin with SOL for tx fees
  console.log('\n--- Prep: Fund demo trader & admin with SOL ---');
  const fundTx = new Transaction()
    .add(
      SystemProgram.transfer({
        fromPubkey: feePayerKeypair.publicKey,
        toPubkey: traderKeypair.publicKey,
        lamports: 0.05 * 1e9,
      }),
    )
    .add(
      SystemProgram.transfer({
        fromPubkey: feePayerKeypair.publicKey,
        toPubkey: adminKeypair.publicKey,
        lamports: 0.05 * 1e9,
      }),
    );
  const fundSig = await sendAndConfirmTransaction(connection, fundTx, [feePayerKeypair]);
  console.log(`  Fund tx: ${fundSig}`);

  // Create ATAs
  console.log('\n--- Prep: Create token accounts ---');

  // Admin ATA (the on-chain admin wallet that will do admin_deposit)
  const adminAta = await getOrCreateAssociatedTokenAccount(
    connection,
    feePayerKeypair,
    TEST_USDC_MINT,
    adminKeypair.publicKey,
  );

  // Protocol wallet ATA (receives 35% of fees — same as admin in this setup)
  const protocolAta = await getOrCreateAssociatedTokenAccount(
    connection,
    feePayerKeypair,
    TEST_USDC_MINT,
    adminKeypair.publicKey, // protocol_wallet was set to admin during init
  );

  const vaultAta = await getOrCreateAssociatedTokenAccount(
    connection,
    feePayerKeypair,
    TEST_USDC_MINT,
    payoutVaultPda,
    true, // allowOwnerOffCurve (PDA)
  );

  const traderAta = await getOrCreateAssociatedTokenAccount(
    connection,
    feePayerKeypair,
    TEST_USDC_MINT,
    traderKeypair.publicKey,
  );

  // Mint test USDC to admin (for admin_deposit) and trader (for evaluation fee)
  // The mint authority is feePayerKeypair (5tkY...) which created the test mint
  console.log('  Minting 200 test USDC to admin...');
  await mintTo(
    connection,
    feePayerKeypair,
    TEST_USDC_MINT,
    adminAta.address,
    feePayerKeypair,
    BigInt(200 * 10 ** USDC_DECIMALS),
  );

  console.log('  Minting 100 test USDC to trader...');
  await mintTo(
    connection,
    feePayerKeypair,
    TEST_USDC_MINT,
    traderAta.address,
    feePayerKeypair,
    BigInt(100 * 10 ** USDC_DECIMALS),
  );

  // =========================================================================
  // TX 1: Admin Deposit — seed 100 USDC into PDA vault
  // =========================================================================
  console.log('\n========================================');
  console.log('TX 1: Admin Deposit (100 USDC → PDA Vault)');
  console.log('========================================');

  const tx1Sig = await program.methods
    .adminDeposit(usdc(100))
    .accounts({
      vaultState: vaultStatePda,
      admin: adminKeypair.publicKey,
      adminTokenAccount: adminAta.address,
      payoutVaultTokenAccount: vaultAta.address,
      tokenMint: TEST_USDC_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([adminKeypair])
    .rpc();

  await connection.confirmTransaction(tx1Sig, 'confirmed');
  console.log(`  ✓ TX signature: ${tx1Sig}`);
  console.log(`  Explorer: https://explorer.solana.com/tx/${tx1Sig}?cluster=devnet`);

  const vaultBalance1 = await getAccount(connection, vaultAta.address);
  console.log(`  Vault balance: ${Number(vaultBalance1.amount) / 10 ** USDC_DECIMALS} USDC`);

  // =========================================================================
  // TX 2: Deposit Evaluation Fee — trader buys $2,500 challenge for 25 USDC
  // =========================================================================
  console.log('\n========================================');
  console.log('TX 2: Deposit Evaluation Fee (25 USDC)');
  console.log('========================================');

  // Derive TraderAccount PDA
  const [traderAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('trader'), traderKeypair.publicKey.toBuffer()],
    PROGRAM_ID,
  );
  console.log(`  TraderAccount PDA: ${traderAccountPda.toBase58()}`);

  // Generate a random evaluation ID (32 bytes)
  const evaluationId = Array.from(crypto.randomBytes(32));

  const tx2Sig = await program.methods
    .depositEvaluationFee(
      usdc(25),           // fee amount
      usdc(2500),         // account size ($2,500)
      evaluationId,       // evaluation_id: [u8; 32]
    )
    .accounts({
      vaultState: vaultStatePda,
      traderAccount: traderAccountPda,
      trader: traderKeypair.publicKey,
      traderTokenAccount: traderAta.address,
      protocolTokenAccount: protocolAta.address,
      payoutVaultTokenAccount: vaultAta.address,
      tokenMint: TEST_USDC_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([traderKeypair])
    .rpc();

  await connection.confirmTransaction(tx2Sig, 'confirmed');
  console.log(`  ✓ TX signature: ${tx2Sig}`);
  console.log(`  Explorer: https://explorer.solana.com/tx/${tx2Sig}?cluster=devnet`);

  // Show split
  const protocolBal = await getAccount(connection, protocolAta.address);
  const vaultBalance2 = await getAccount(connection, vaultAta.address);
  console.log(`  Fee split: 35% protocol (${Number(protocolBal.amount) / 10 ** USDC_DECIMALS} USDC) / 65% vault`);
  console.log(`  Vault balance: ${Number(vaultBalance2.amount) / 10 ** USDC_DECIMALS} USDC`);

  // =========================================================================
  // TX 3: Submit Result — admin marks trader as passed
  // =========================================================================
  console.log('\n========================================');
  console.log('TX 3: Submit Result (trader passed!)');
  console.log('========================================');

  // Profit target for $2,500 at 8% = $2,700
  const finalBalance = usdc(2750); // above the 8% target
  const realizedPnl = new BN(250 * 10 ** USDC_DECIMALS); // +$250 profit
  const tradeCount = 10; // above min_trades_to_pass (5)
  const resultHash = Array.from(crypto.randomBytes(32));
  const proof = Array.from(crypto.randomBytes(32));

  const tx3Sig = await program.methods
    .submitResult(
      finalBalance,
      realizedPnl,
      tradeCount,
      resultHash,
      proof,
    )
    .accounts({
      vaultState: vaultStatePda,
      traderAccount: traderAccountPda,
      admin: adminKeypair.publicKey,
    })
    .signers([adminKeypair])
    .rpc();

  await connection.confirmTransaction(tx3Sig, 'confirmed');
  console.log(`  ✓ TX signature: ${tx3Sig}`);
  console.log(`  Explorer: https://explorer.solana.com/tx/${tx3Sig}?cluster=devnet`);

  // Fetch and display trader account state
  const traderState = await program.account.traderAccount.fetch(traderAccountPda);
  console.log(`  Trader status: ${JSON.stringify(traderState.status)}`);
  console.log(`  Attempt: ${traderState.currentAttempt}`);
  console.log(`  Trade count: ${traderState.tradeCount}`);

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n========================================');
  console.log('Summary — 3 Transactions Completed');
  console.log('========================================');
  console.log(`  TX 1 (Admin Deposit):       ${tx1Sig}`);
  console.log(`  TX 2 (Evaluation Fee):      ${tx2Sig}`);
  console.log(`  TX 3 (Submit Result):       ${tx3Sig}`);
  console.log(`\n  All on Devnet explorer: https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`);
  console.log('');
}

main().catch((err) => {
  console.error('\nDemo failed:', err);
  process.exit(1);
});
