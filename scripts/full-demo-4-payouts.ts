// =============================================================================
// Setl8 — Full Demo: 4 Traders, 4 Confirmed Payouts on Devnet
//
// Flow per trader:
//   1. Fund with SOL + mint USDC
//   2. Attempt 1: deposit_evaluation_fee → submit_result (pass) [eval only]
//   3. Attempt 2: deposit_evaluation_fee → submit_result (pass) [eval only]
//   4. Attempt 3: deposit_evaluation_fee → submit_result (pass) [payout eligible]
//   5. submit_payout_request → process_payout (PDA vault → trader)
//
// Also:
//   - Mint 100,000 USDC to admin wallet
//   - Admin deposits into vault to ensure sufficient payout liquidity
//   - Admin earns 35% of every fee paid
//
// Usage: from the repository root: npx tsx scripts/full-demo-4-payouts.ts
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
const FEE_PAYER_PATH = `${process.env.HOME}/.config/solana/id.json`;
const ADMIN_PATH = `${process.env.HOME}/.config/solana/admin.json`;
const IDL_PATH = path.resolve(__dirname, '../target/idl/setl8_vault.json');

const PROGRAM_ID = new PublicKey('C3bvX2hkL76wXNobbyJPV5JpEPRFc3ksA4khR8WU9Rnk');
const TEST_USDC_MINT = new PublicKey('ivFfzaEFj6fAePeU2W6kum6fXUuy2qH5hDkr74R8STG');
const USDC_DECIMALS = 6;

// Trader configs: [label, fee_usdc, account_size_usdc]
const TRADERS = [
  { label: 'Trader A', fee: 80,  accountSize: 10_000 },
  { label: 'Trader B', fee: 155, accountSize: 20_000 },
  { label: 'Trader C', fee: 320, accountSize: 50_000 },
  { label: 'Trader D', fee: 620, accountSize: 100_000 },
] as const;

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

function usdcBigint(amount: number): bigint {
  return BigInt(amount) * BigInt(10 ** USDC_DECIMALS);
}

function fmtUsdc(raw: bigint | number): string {
  return (Number(raw) / 10 ** USDC_DECIMALS).toLocaleString();
}

function explorerTx(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('  SETL8 — Full Demo: 4 Traders, 4 Confirmed Payouts');
  console.log('='.repeat(70) + '\n');

  const feePayer = loadKeypair(FEE_PAYER_PATH);
  const admin = loadKeypair(ADMIN_PATH);
  const connection = new Connection(RPC_URL, 'confirmed');
  const wallet = new Wallet(feePayer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });

  const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf-8'));
  const program = new Program(idl, provider);

  // Derive PDAs
  const [vaultStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_state')], PROGRAM_ID,
  );
  const [payoutVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('payout_vault'), vaultStatePda.toBuffer()], PROGRAM_ID,
  );

  console.log(`  Fee Payer (mint auth): ${feePayer.publicKey.toBase58()}`);
  console.log(`  Admin (on-chain):      ${admin.publicKey.toBase58()}`);
  console.log(`  VaultState PDA:        ${vaultStatePda.toBase58()}`);
  console.log(`  Payout Vault PDA:      ${payoutVaultPda.toBase58()}`);

  // =========================================================================
  // STEP 0: Fund admin with SOL, create ATAs, mint 100,000 USDC to admin
  // =========================================================================
  console.log('\n' + '-'.repeat(70));
  console.log('  STEP 0: Setup — fund admin, create ATAs, mint USDC');
  console.log('-'.repeat(70));

  // Fund admin with SOL
  const fundAdminTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: feePayer.publicKey,
      toPubkey: admin.publicKey,
      lamports: 0.5 * 1e9,
    }),
  );
  await sendAndConfirmTransaction(connection, fundAdminTx, [feePayer]);
  console.log('  Admin funded with 0.5 SOL');

  // Admin ATA
  const adminAta = await getOrCreateAssociatedTokenAccount(
    connection, feePayer, TEST_USDC_MINT, admin.publicKey,
  );
  console.log(`  Admin ATA: ${adminAta.address.toBase58()}`);

  // Vault PDA ATA
  const vaultAta = await getOrCreateAssociatedTokenAccount(
    connection, feePayer, TEST_USDC_MINT, payoutVaultPda, true,
  );
  console.log(`  Vault ATA: ${vaultAta.address.toBase58()}`);

  // Mint 100,000 USDC to admin
  await mintTo(
    connection, feePayer, TEST_USDC_MINT, adminAta.address,
    feePayer, usdcBigint(100_000),
  );
  const adminBal = await getAccount(connection, adminAta.address);
  console.log(`  Minted 100,000 USDC to admin. Balance: ${fmtUsdc(adminBal.amount)} USDC`);

  // =========================================================================
  // STEP 1: Admin deposits 20,000 USDC into PDA vault (seed liquidity)
  // =========================================================================
  console.log('\n' + '-'.repeat(70));
  console.log('  STEP 1: Admin Deposit — 20,000 USDC into PDA vault');
  console.log('-'.repeat(70));

  const adminDepositSig = await program.methods
    .adminDeposit(usdc(20_000))
    .accounts({
      vaultState: vaultStatePda,
      admin: admin.publicKey,
      adminTokenAccount: adminAta.address,
      payoutVaultTokenAccount: vaultAta.address,
      tokenMint: TEST_USDC_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([admin])
    .rpc();
  await connection.confirmTransaction(adminDepositSig, 'confirmed');
  console.log(`  TX: ${adminDepositSig}`);
  console.log(`  ${explorerTx(adminDepositSig)}`);

  const vaultBal0 = await getAccount(connection, vaultAta.address);
  console.log(`  Vault balance: ${fmtUsdc(vaultBal0.amount)} USDC`);

  // =========================================================================
  // STEP 2: Setup 4 traders — generate keypairs, fund, mint USDC
  // =========================================================================
  console.log('\n' + '-'.repeat(70));
  console.log('  STEP 2: Create & fund 4 trader wallets (100,000 USDC each)');
  console.log('-'.repeat(70));

  const traderData: Array<{
    label: string;
    fee: number;
    accountSize: number;
    keypair: Keypair;
    ata: Awaited<ReturnType<typeof getOrCreateAssociatedTokenAccount>>;
    traderAccountPda: PublicKey;
  }> = [];

  for (let i = 0; i < TRADERS.length; i++) {
    const t = TRADERS[i];
    const kp = Keypair.generate();

    // Fund with SOL
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: feePayer.publicKey,
        toPubkey: kp.publicKey,
        lamports: 0.1 * 1e9,
      }),
    );
    await sendAndConfirmTransaction(connection, fundTx, [feePayer]);

    // Create ATA + mint 100,000 USDC
    const ata = await getOrCreateAssociatedTokenAccount(
      connection, feePayer, TEST_USDC_MINT, kp.publicKey,
    );
    await mintTo(
      connection, feePayer, TEST_USDC_MINT, ata.address,
      feePayer, usdcBigint(100_000),
    );

    const [traderAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('trader'), kp.publicKey.toBuffer()], PROGRAM_ID,
    );

    traderData.push({
      label: t.label,
      fee: t.fee,
      accountSize: t.accountSize,
      keypair: kp,
      ata,
      traderAccountPda,
    });

    console.log(`  ${t.label}: ${kp.publicKey.toBase58()}`);
    console.log(`    ATA: ${ata.address.toBase58()}`);
    console.log(`    Account size: $${t.accountSize.toLocaleString()} | Fee: $${t.fee}`);
    console.log(`    TraderAccount PDA: ${traderAccountPda.toBase58()}`);
  }

  // =========================================================================
  // STEP 3-5: For each trader, run 3 attempts (pass all), then payout
  // =========================================================================

  // Protocol wallet ATA (receives 35% fees — same as admin in this deploy)
  const protocolAta = adminAta; // protocol_wallet was set to admin during init

  let totalFeesCollected = 0;
  let totalProtocolEarnings = 0;

  const payoutResults: Array<{
    label: string;
    payoutAmount: number;
    payoutTxSig: string;
  }> = [];

  for (let ti = 0; ti < traderData.length; ti++) {
    const t = traderData[ti];
    console.log('\n' + '='.repeat(70));
    console.log(`  ${t.label} — $${t.accountSize.toLocaleString()} account ($${t.fee} fee)`);
    console.log('='.repeat(70));

    // ----- Run 3 attempts -----
    for (let attempt = 1; attempt <= 3; attempt++) {
      const phase = attempt <= 2 ? 'EVAL' : 'FUNDED (payout eligible)';
      console.log(`\n  --- Attempt ${attempt}/3 [${phase}] ---`);

      // Deposit evaluation fee
      const evaluationId = Array.from(crypto.randomBytes(32));
      const depositSig = await program.methods
        .depositEvaluationFee(
          usdc(t.fee),
          usdc(t.accountSize),
          evaluationId,
        )
        .accounts({
          vaultState: vaultStatePda,
          traderAccount: t.traderAccountPda,
          trader: t.keypair.publicKey,
          traderTokenAccount: t.ata.address,
          protocolTokenAccount: protocolAta.address,
          payoutVaultTokenAccount: vaultAta.address,
          tokenMint: TEST_USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([t.keypair])
        .rpc();
      await connection.confirmTransaction(depositSig, 'confirmed');

      const protocolCut = t.fee * 0.35;
      const vaultCut = t.fee * 0.65;
      totalFeesCollected += t.fee;
      totalProtocolEarnings += protocolCut;

      console.log(`  Fee paid: $${t.fee} → protocol $${protocolCut} / vault $${vaultCut}`);
      console.log(`  Deposit TX: ${depositSig}`);

      // Submit result — pass with profit above 8% target
      const profitTarget = t.accountSize * 1.08;
      const finalBalance = Math.floor(profitTarget + t.accountSize * 0.02); // +10% total
      const resultHash = Array.from(crypto.randomBytes(32));
      const proof = Array.from(crypto.randomBytes(32));

      const resultSig = await program.methods
        .submitResult(
          usdc(finalBalance),
          new BN(Math.floor(t.accountSize * 0.10) * 10 ** USDC_DECIMALS),
          10, // trade_count (above min 5)
          resultHash,
          proof,
        )
        .accounts({
          vaultState: vaultStatePda,
          traderAccount: t.traderAccountPda,
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc();
      await connection.confirmTransaction(resultSig, 'confirmed');
      console.log(`  Result: PASSED (balance $${finalBalance.toLocaleString()} > target $${Math.floor(profitTarget).toLocaleString()})`);
      console.log(`  Result TX: ${resultSig}`);

      // Small delay between attempts to avoid rate limiting
      await sleep(500);
    }

    // ----- Submit payout request (attempt 3, payout eligible) -----
    console.log(`\n  --- Payout Request ---`);

    // 8% of account size
    const payoutAmount = Math.floor(t.accountSize * 0.08);
    const [payoutRequestPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('payout'), t.keypair.publicKey.toBuffer(), Buffer.from([3])], // attempt 3
      PROGRAM_ID,
    );

    const payoutReqSig = await program.methods
      .submitPayoutRequest(usdc(payoutAmount))
      .accounts({
        vaultState: vaultStatePda,
        traderAccount: t.traderAccountPda,
        payoutRequest: payoutRequestPda,
        admin: admin.publicKey,
        tokenMint: TEST_USDC_MINT,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
    await connection.confirmTransaction(payoutReqSig, 'confirmed');
    console.log(`  Payout request: $${payoutAmount.toLocaleString()} USDC`);
    console.log(`  PayoutRequest PDA: ${payoutRequestPda.toBase58()}`);
    console.log(`  Request TX: ${payoutReqSig}`);

    // ----- Process payout (PDA vault → trader) -----
    console.log(`\n  --- Process Payout ---`);

    const payoutSig = await program.methods
      .processPayout(usdc(payoutAmount))
      .accounts({
        vaultState: vaultStatePda,
        payoutRequest: payoutRequestPda,
        traderAccount: t.traderAccountPda,
        admin: admin.publicKey,
        payoutVault: payoutVaultPda,
        payoutVaultTokenAccount: vaultAta.address,
        traderTokenAccount: t.ata.address,
        tokenMint: TEST_USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([admin])
      .rpc();
    await connection.confirmTransaction(payoutSig, 'confirmed');

    // Verify payout request status
    const prState = await program.account.payoutRequest.fetch(payoutRequestPda);
    const traderBal = await getAccount(connection, t.ata.address);

    console.log(`  Payout status: ${JSON.stringify(prState.status)}`);
    console.log(`  Trader USDC balance: ${fmtUsdc(traderBal.amount)} USDC`);
    console.log(`  Payout TX: ${payoutSig}`);
    console.log(`  ${explorerTx(payoutSig)}`);

    payoutResults.push({
      label: t.label,
      payoutAmount,
      payoutTxSig: payoutSig,
    });

    await sleep(500);
  }

  // =========================================================================
  // FINAL SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(70));
  console.log('  FINAL SUMMARY');
  console.log('='.repeat(70));

  const adminBalFinal = await getAccount(connection, adminAta.address);
  const vaultBalFinal = await getAccount(connection, vaultAta.address);

  console.log(`\n  Admin wallet USDC balance: ${fmtUsdc(adminBalFinal.amount)} USDC`);
  console.log(`  PDA Vault USDC balance:    ${fmtUsdc(vaultBalFinal.amount)} USDC`);
  console.log(`  Total fees collected:      $${totalFeesCollected.toLocaleString()}`);
  console.log(`  Admin earnings (35%):      $${totalProtocolEarnings.toLocaleString()}`);
  console.log(`  Vault deposits (65%):      $${(totalFeesCollected - totalProtocolEarnings).toLocaleString()}`);

  console.log('\n  4 CONFIRMED PAYOUTS:');
  console.log('  ' + '-'.repeat(66));
  for (const p of payoutResults) {
    console.log(`  ${p.label}: $${p.payoutAmount.toLocaleString()} USDC — COMPLETED`);
    console.log(`    TX: ${p.payoutTxSig}`);
    console.log(`    ${explorerTx(p.payoutTxSig)}`);
  }

  console.log('\n  Program: https://explorer.solana.com/address/' +
    `${PROGRAM_ID.toBase58()}?cluster=devnet`);
  console.log('');
}

main().catch((err) => {
  console.error('\nDemo failed:', err);
  process.exit(1);
});
