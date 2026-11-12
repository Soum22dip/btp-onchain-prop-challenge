import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  TOKEN_INFO,
  VAULT_PROGRAM_ID,
  VAULT_STATE_SEED,
  PAYOUT_VAULT_SEED,
  TRADER_ACCOUNT_SEED,
  DEPOSIT_FEE_DISCRIMINATOR,
  PROTOCOL_WALLET_ADDRESS,
} from '@setl8/constants';
import type { TokenSymbol } from '@setl8/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROGRAM_ID = new PublicKey(VAULT_PROGRAM_ID);
const PROTOCOL_WALLET = new PublicKey(PROTOCOL_WALLET_ADDRESS);
const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
const SOLANA_NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? 'devnet') as 'devnet' | 'mainnet-beta';

// Derive VaultState PDA
const [VAULT_STATE_PDA] = PublicKey.findProgramAddressSync(
  [Buffer.from(VAULT_STATE_SEED)],
  PROGRAM_ID,
);

// Derive Payout Vault PDA (authority for vault token accounts)
const [PAYOUT_VAULT_PDA] = PublicKey.findProgramAddressSync(
  [Buffer.from(PAYOUT_VAULT_SEED), VAULT_STATE_PDA.toBuffer()],
  PROGRAM_ID,
);

// ---------------------------------------------------------------------------
// buildPurchaseTransaction
// ---------------------------------------------------------------------------

/**
 * Builds a Solana transaction that calls deposit_evaluation_fee on the
 * setl8-vault program. The contract atomically splits the fee: 35% to the
 * admin wallet, 65% to the PDA vault.
 *
 * Also creates/updates the TraderAccount PDA on-chain.
 */
export async function buildPurchaseTransaction({
  walletPublicKey,
  feeAmountUsd,
  accountSizeUsd,
  tokenSymbol,
  connection,
}: {
  walletPublicKey: PublicKey;
  feeAmountUsd: number;
  accountSizeUsd: number;
  tokenSymbol: TokenSymbol;
  connection: Connection;
}): Promise<Transaction> {
  const tokenInfo = TOKEN_INFO[tokenSymbol];
  const mintAddress = SOLANA_NETWORK === 'devnet' ? tokenInfo.devnetMint : tokenInfo.mainnetMint;
  const mintPubkey = new PublicKey(mintAddress);

  // Derive TraderAccount PDA
  const [traderAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(TRADER_ACCOUNT_SEED), walletPublicKey.toBuffer()],
    PROGRAM_ID,
  );

  // Get all required ATAs
  const traderAta = await getAssociatedTokenAddress(mintPubkey, walletPublicKey);
  const protocolAta = await getAssociatedTokenAddress(mintPubkey, PROTOCOL_WALLET);
  // PDA vault ATA — allowOwnerOffCurve = true since PDA is off-curve
  const vaultAta = await getAssociatedTokenAddress(mintPubkey, PAYOUT_VAULT_PDA, true);

  // Amount in token smallest units (6 decimals). Round through cents so a
  // non-integer feeAmountUsd doesn't make BigInt() throw.
  const amountUnits = BigInt(Math.round(feeAmountUsd * 1_000_000));
  const accountSizeUnits = BigInt(Math.round(accountSizeUsd * 1_000_000));

  // Generate a 32-byte evaluation ID (random)
  const evaluationId = new Uint8Array(32);
  crypto.getRandomValues(evaluationId);

  // Build instruction data:
  // discriminator (8) + amount (8 LE u64) + account_size (8 LE u64) + evaluationId (32)
  const data = Buffer.alloc(8 + 8 + 8 + 32);
  data.set(DEPOSIT_FEE_DISCRIMINATOR, 0);

  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(amountUnits);
  data.set(amountBuf, 8);

  const sizeBuf = Buffer.alloc(8);
  sizeBuf.writeBigUInt64LE(accountSizeUnits);
  data.set(sizeBuf, 16);

  data.set(evaluationId, 24);

  // Build the deposit_evaluation_fee instruction
  const depositIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: VAULT_STATE_PDA,    isSigner: false, isWritable: true },
      { pubkey: traderAccountPda,   isSigner: false, isWritable: true },
      { pubkey: walletPublicKey,    isSigner: true,  isWritable: true },
      { pubkey: traderAta,          isSigner: false, isWritable: true },
      { pubkey: protocolAta,        isSigner: false, isWritable: true },
      { pubkey: vaultAta,           isSigner: false, isWritable: true },
      { pubkey: mintPubkey,         isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID,   isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM_ID,  isSigner: false, isWritable: false },
    ],
    data,
  });

  // Build transaction
  const tx = new Transaction();
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = walletPublicKey;

  // Create trader ATA if it doesn't exist
  const traderAtaInfo = await connection.getAccountInfo(traderAta);
  if (!traderAtaInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        walletPublicKey,
        traderAta,
        walletPublicKey,
        mintPubkey,
      ),
    );
  }

  tx.add(depositIx);
  return tx;
}
