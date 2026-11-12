// =============================================================================
// Setl8 — Initialize PDA Vault Program on Devnet
//
// 1. Closes old VaultState PDA if it exists (transfers lamports back to admin)
// 2. Calls initialize with new PDA vault architecture
// 3. Creates ATAs for admin wallet and PDA vault
// 4. Optionally mints test USDC to a trader wallet
//
// Usage:  from the repository root: npx tsx scripts/init-program.ts [TRADER_WALLET]
// =============================================================================

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from '@solana/spl-token';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const ADMIN_KEYPAIR_PATH = `${process.env.HOME}/.config/solana/id.json`;
const IDL_PATH = path.resolve(__dirname, '../target/idl/setl8_vault.json');

const PROGRAM_ID = new PublicKey('C3bvX2hkL76wXNobbyJPV5JpEPRFc3ksA4khR8WU9Rnk');

// New admin wallet that receives 35% protocol fees
const ADMIN_WALLET = new PublicKey('9Ru75YJUUSaXdEaP9FRmeUzwZDCbWWDYE5THKnwbYSr7');

// Test USDC mint on devnet
const TEST_USDC_MINT = new PublicKey('ivFfzaEFj6fAePeU2W6kum6fXUuy2qH5hDkr74R8STG');

const USDC_DECIMALS = 6;

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
  console.log('\n=== Setl8 — Initialize PDA Vault ===\n');

  const adminKeypair = loadKeypair(ADMIN_KEYPAIR_PATH);

  log(`Admin signer:     ${adminKeypair.publicKey.toBase58()}`);
  log(`Protocol wallet:  ${ADMIN_WALLET.toBase58()}`);
  log(`Program ID:       ${PROGRAM_ID.toBase58()}`);
  log(`Test USDC mint:   ${TEST_USDC_MINT.toBase58()}`);

  const connection = new Connection(RPC_URL, 'confirmed');
  const wallet = new Wallet(adminKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });

  // Load IDL
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf-8'));
  const program = new Program(idl, provider);

  // Derive VaultState PDA
  const [vaultStatePda, vaultStateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_state')],
    PROGRAM_ID,
  );
  log(`VaultState PDA:   ${vaultStatePda.toBase58()} (bump: ${vaultStateBump})`);

  // Derive Payout Vault PDA
  const [payoutVaultPda, payoutVaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('payout_vault'), vaultStatePda.toBuffer()],
    PROGRAM_ID,
  );
  log(`Payout Vault PDA: ${payoutVaultPda.toBase58()} (bump: ${payoutVaultBump})`);

  // -----------------------------------------------------------------------
  // Step 0: Check if old VaultState exists and try to close it
  // -----------------------------------------------------------------------
  const existingAccount = await connection.getAccountInfo(vaultStatePda);
  let alreadyInitialized = false;

  if (existingAccount) {
    console.log('\n--- Step 0: VaultState PDA exists ---');
    log(`Size: ${existingAccount.data.length} bytes, lamports: ${existingAccount.lamports}`);

    // Check discriminator to see if it matches new layout
    const disc = existingAccount.data.slice(0, 8);
    const expectedDisc = Buffer.from([228, 196, 82, 165, 98, 210, 235, 152]);
    if (disc.equals(expectedDisc)) {
      log('Discriminator matches new VaultState layout — already initialized.');
      alreadyInitialized = true;
    } else {
      log('Old layout detected — cannot re-init over existing PDA.');
      log('The old VaultState must be closed first.');
      log('Since this is devnet, you can redeploy with a new program ID, or add a close_vault instruction.');
      console.error('\nERROR: Old VaultState PDA blocks initialization. Manual intervention needed.');
      process.exit(1);
    }
  }

  // -----------------------------------------------------------------------
  // Step 1: Initialize the program
  // -----------------------------------------------------------------------
  if (!alreadyInitialized) {
    console.log('\n--- Step 1: Initialize program ---');

    const supportedMints = [TEST_USDC_MINT];

    const txSig = await program.methods
      .initialize(
        ADMIN_WALLET,                // protocol_wallet
        supportedMints,              // supported_mints
        5,                           // min_trades_to_pass
        800,                         // max_payout_bps (8%)
        4000,                        // max_cumulative_payout_bps (40%)
        { toNumber: () => 10_000_000 } as never, // min_payout_amount ($10 in 6-decimal units)
        3500,                        // fee_split_protocol_bps (35%)
        2500,                        // trader_reserve_bps (25%)
      )
      .accounts({
        vaultState: vaultStatePda,
        admin: adminKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKeypair])
      .rpc();

    log(`Initialize tx: ${txSig}`);
    await connection.confirmTransaction(txSig, 'confirmed');
    log('Program initialized!');
  }

  // Verify the account exists on-chain
  const verifyAccount = await connection.getAccountInfo(vaultStatePda);
  if (verifyAccount) {
    log(`VaultState verified: ${verifyAccount.data.length} bytes, owner: ${verifyAccount.owner.toBase58()}`);
  }

  // -----------------------------------------------------------------------
  // Step 2: Create ATAs
  // -----------------------------------------------------------------------
  console.log('\n--- Step 2: Create token accounts (ATAs) ---');

  // Admin wallet ATA (receives 35% protocol fees)
  const adminAta = await getOrCreateAssociatedTokenAccount(
    connection,
    adminKeypair,
    TEST_USDC_MINT,
    ADMIN_WALLET,
  );
  log(`Admin ATA:        ${adminAta.address.toBase58()}`);

  // PDA vault ATA (allowOwnerOffCurve = true since PDA is off-curve)
  const vaultAta = await getOrCreateAssociatedTokenAccount(
    connection,
    adminKeypair,
    TEST_USDC_MINT,
    payoutVaultPda,
    true, // allowOwnerOffCurve
  );
  log(`Vault PDA ATA:    ${vaultAta.address.toBase58()}`);

  // -----------------------------------------------------------------------
  // Step 3: Mint test USDC to trader (optional)
  // -----------------------------------------------------------------------
  const traderArg = process.argv[2];
  if (traderArg) {
    console.log('\n--- Step 3: Mint test USDC to trader ---');
    const traderPubkey = new PublicKey(traderArg);
    const traderAta = await getOrCreateAssociatedTokenAccount(
      connection,
      adminKeypair,
      TEST_USDC_MINT,
      traderPubkey,
    );
    log(`Trader:           ${traderPubkey.toBase58()}`);
    log(`Trader ATA:       ${traderAta.address.toBase58()}`);

    const mintAmount = BigInt(1000) * BigInt(10 ** USDC_DECIMALS);
    await mintTo(
      connection,
      adminKeypair,
      TEST_USDC_MINT,
      traderAta.address,
      adminKeypair,
      mintAmount,
    );

    const traderAccount = await getAccount(connection, traderAta.address);
    log(`Trader balance:   ${Number(traderAccount.amount) / 10 ** USDC_DECIMALS} USDC`);
  } else {
    console.log('\n  Tip: pass a trader wallet to mint test USDC:');
    console.log('    npx tsx scripts/init-program.ts <WALLET_ADDRESS>\n');
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log('\n=== Summary ===\n');
  console.log(`  Program ID:       ${PROGRAM_ID.toBase58()}`);
  console.log(`  VaultState PDA:   ${vaultStatePda.toBase58()}`);
  console.log(`  Payout Vault PDA: ${payoutVaultPda.toBase58()}`);
  console.log(`  Admin wallet:     ${ADMIN_WALLET.toBase58()}`);
  console.log(`  Test USDC mint:   ${TEST_USDC_MINT.toBase58()}`);
  console.log(`  Admin ATA:        ${adminAta.address.toBase58()}`);
  console.log(`  Vault PDA ATA:    ${vaultAta.address.toBase58()}`);
  console.log(`  Fee split:        35% admin / 65% vault`);
  console.log(`  Trader reserve:   25% locked in vault`);
  console.log('');
}

main().catch((err) => {
  console.error('\nInitialization failed:', err);
  process.exit(1);
});
