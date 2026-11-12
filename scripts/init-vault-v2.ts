import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey("C3bvX2hkL76wXNobbyJPV5JpEPRFc3ksA4khR8WU9Rnk");
const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';

const ADMIN_KEYPAIR_PATH = path.join(process.env.HOME || "~", ".config/solana/admin.json");
const PROTOCOL_WALLET = new PublicKey("9Ru75YJUUSaXdEaP9FRmeUzwZDCbWWDYE5THKnwbYSr7");
const USDC_MINT = new PublicKey("ivFfzaEFj6fAePeU2W6kum6fXUuy2qH5hDkr74R8STG");

const FEE_SPLIT_PROTOCOL_BPS = 3500; // 35%
const TRADER_RESERVE_BPS = 2500;     // 25%

function anchorDisc(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function serializePubkey(pk: PublicKey): Buffer {
  return pk.toBuffer();
}

function serializeVecPubkeys(pks: PublicKey[]): Buffer {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(pks.length);
  return Buffer.concat([lenBuf, ...pks.map((pk) => pk.toBuffer())]);
}

function serializeU16(val: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(val);
  return buf;
}

async function main() {
  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(ADMIN_KEYPAIR_PATH, "utf-8")))
  );
  console.log("Admin:", adminKp.publicKey.toBase58());

  const conn = new Connection(RPC, "confirmed");
  const balance = await conn.getBalance(adminKp.publicKey);
  console.log("Balance:", balance / 1e9, "SOL");

  // Derive PDAs
  const [vaultStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_state")],
    PROGRAM_ID
  );
  const [payoutVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("payout_vault"), vaultStatePda.toBuffer()],
    PROGRAM_ID
  );

  console.log("\nVaultState PDA:    ", vaultStatePda.toBase58());
  console.log("Payout Vault PDA:  ", payoutVaultPda.toBase58());

  // Check if already initialized
  const existing = await conn.getAccountInfo(vaultStatePda);
  if (existing && existing.data.length > 0 && existing.data[0] !== 0) {
    console.log("\nVaultState already exists — already initialized.");
    return;
  }

  // Build instruction data
  const supportedMints = [USDC_MINT];
  const data = Buffer.concat([
    anchorDisc("initialize"),
    serializePubkey(PROTOCOL_WALLET),
    serializeVecPubkeys(supportedMints),
    serializeU16(FEE_SPLIT_PROTOCOL_BPS),
    serializeU16(TRADER_RESERVE_BPS),
  ]);

  const keys = [
    { pubkey: vaultStatePda, isSigner: false, isWritable: true },
    { pubkey: adminKp.publicKey, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  const ix = new TransactionInstruction({
    keys,
    programId: PROGRAM_ID,
    data,
  });

  console.log("\nSending initialize transaction...");

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [adminKp], {
    commitment: "confirmed",
  });

  console.log("\n========================================");
  console.log("  VAULT V2 INITIALIZED");
  console.log("========================================");
  console.log("Transaction:         ", sig);
  console.log("");
  console.log("--- Addresses ---");
  console.log("Program ID:          ", PROGRAM_ID.toBase58());
  console.log("VaultState PDA:      ", vaultStatePda.toBase58());
  console.log("Payout Vault PDA:    ", payoutVaultPda.toBase58());
  console.log("Admin:               ", adminKp.publicKey.toBase58());
  console.log("Protocol Wallet:     ", PROTOCOL_WALLET.toBase58());
  console.log("USDC Mint:           ", USDC_MINT.toBase58());
  console.log("");
  console.log("--- Config ---");
  console.log("Fee Split Protocol:  ", FEE_SPLIT_PROTOCOL_BPS, "bps (35%)");
  console.log("Trader Reserve:      ", TRADER_RESERVE_BPS, "bps (25%)");
  console.log("Supported Mints:     ", supportedMints.map((m) => m.toBase58()).join(", "));
  console.log("Payout per phase:    ", "800 bps (8%) — hardcoded constant");
  console.log("Heartbeat interval:  ", "5 days — hardcoded constant");
}

main().catch((err) => {
  console.error("Init failed:", err);
  process.exit(1);
});
