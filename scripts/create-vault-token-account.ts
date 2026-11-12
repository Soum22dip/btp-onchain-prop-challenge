import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const ADMIN_KEYPAIR_PATH = path.join(process.env.HOME || "~", ".config/solana/admin.json");
const USDC_MINT = new PublicKey("ivFfzaEFj6fAePeU2W6kum6fXUuy2qH5hDkr74R8STG");
const PAYOUT_VAULT_PDA = new PublicKey("2PEiN77B9k9nnLPEZqZpWR14TGdp86L5x4wyTM1M4uYY");

async function main() {
  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(ADMIN_KEYPAIR_PATH, "utf-8")))
  );
  const conn = new Connection(RPC, "confirmed");

  console.log("Admin (payer):", adminKp.publicKey.toBase58());
  console.log("Vault PDA (owner):", PAYOUT_VAULT_PDA.toBase58());
  console.log("USDC Mint:", USDC_MINT.toBase58());

  // Derive ATA with allowOwnerOffCurve = true (PDA owner)
  const ata = await getAssociatedTokenAddress(
    USDC_MINT,
    PAYOUT_VAULT_PDA,
    true, // allowOwnerOffCurve
  );
  console.log("\nVault USDC ATA:", ata.toBase58());

  // Check if it already exists
  try {
    const existing = await getAccount(conn, ata);
    console.log("\nATA already exists!");
    console.log("  Owner:", existing.owner.toBase58());
    console.log("  Mint:", existing.mint.toBase58());
    console.log("  Balance:", existing.amount.toString(), `($${Number(existing.amount) / 1_000_000})`);
    return;
  } catch {
    console.log("ATA does not exist yet — creating...");
  }

  const ix = createAssociatedTokenAccountInstruction(
    adminKp.publicKey,  // payer
    ata,                // ATA address
    PAYOUT_VAULT_PDA,   // owner (the PDA)
    USDC_MINT,          // mint
  );

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [adminKp], {
    commitment: "confirmed",
  });
  console.log("Created! tx:", sig);

  // Verify
  const account = await getAccount(conn, ata);
  console.log("\n=== VAULT USDC TOKEN ACCOUNT CREATED ===");
  console.log("ATA Address:  ", ata.toBase58());
  console.log("Owner (PDA):  ", account.owner.toBase58());
  console.log("Mint:         ", account.mint.toBase58());
  console.log("Balance:      ", account.amount.toString(), `($${Number(account.amount) / 1_000_000})`);
  console.log("\nThis is the payout_vault_token_account for both contracts.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
