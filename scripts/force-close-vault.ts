import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createHash } from "crypto";
import * as fs from "fs";

const PROGRAM_ID = new PublicKey("C3bvX2hkL76wXNobbyJPV5JpEPRFc3ksA4khR8WU9Rnk");
const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const adminKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(`${process.env.HOME}/.config/solana/admin.json`, "utf-8"))));

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("vault_state")], PROGRAM_ID);

  const info = await conn.getAccountInfo(vaultPda);
  if (!info) {
    console.log("Vault state PDA doesn't exist — nothing to close. Ready to deploy.");
    return;
  }

  console.log("Old vault state found at", vaultPda.toBase58(), "— force closing...");

  const disc = createHash("sha256").update("global:force_close_vault_state").digest().subarray(0, 8);

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: adminKp.publicKey, isSigner: true, isWritable: true },
    ],
    programId: PROGRAM_ID,
    data: disc,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [adminKp], { commitment: "confirmed" });
  console.log("Force closed! tx:", sig);

  const after = await conn.getAccountInfo(vaultPda);
  console.log("Vault state after close:", after ? "still exists" : "deleted");
}
main();
