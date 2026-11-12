/**
 * Mint devnet TEST USDC (mint authority = protocol wallet) to a trader wallet.
 *
 *   pnpm exec tsx scripts/mint-test-usdc.ts <mint-authority-keypair.json> <mint> <recipient-wallet> [amount-usdc=10000] [rpc-url]
 *
 * Creates the recipient's token account if missing. Prints only public values.
 */
import fs from 'node:fs';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo, getAccount } from '@solana/spl-token';

const [kpPath, mintArg, walletArg, amountArg, rpcArg] = process.argv.slice(2);
if (!kpPath || !mintArg || !walletArg) {
  console.error('usage: tsx scripts/mint-test-usdc.ts <keypair.json> <mint> <recipient> [amount=10000] [rpc]');
  process.exit(1);
}
const RPC = rpcArg || 'https://api.devnet.solana.com';
if (/mainnet/i.test(RPC)) { console.error('Refusing to run against mainnet.'); process.exit(1); }

(async () => {
  const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(kpPath, 'utf-8')) as number[]));
  const mint = new PublicKey(mintArg);
  const owner = new PublicKey(walletArg);
  const conn = new Connection(RPC, 'confirmed');
  const amount = BigInt(Math.round(Number(amountArg || '10000') * 1e6));
  const ata = await getOrCreateAssociatedTokenAccount(conn, authority, mint, owner);
  await mintTo(conn, authority, mint, ata.address, authority, amount);
  const acc = await getAccount(conn, ata.address);
  console.log('Recipient:      ', owner.toBase58());
  console.log('Token account:  ', ata.address.toBase58());
  console.log('Balance (USDC): ', Number(acc.amount) / 1e6);
})().catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
