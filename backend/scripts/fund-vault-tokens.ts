/**
 * Devnet only. Mints TEST tokens straight into the payout-vault PDA's token accounts.
 *
 *   pnpm exec tsx scripts/fund-vault-tokens.ts <protocol-keypair.json> [--usdt-mint <mint>] [--register-usdt] [--amount 100000]
 *
 *  - USDC: mints <amount> more to the vault ATA of the existing test USDC mint (SL89 is mint authority).
 *  - USDT: creates a NEW 6-decimal test mint (or reuses --usdt-mint on a re-run), creates the vault's
 *          ATA for it and mints <amount> into it.
 *  - --register-usdt: also calls update_config to add the USDT mint to supported_mints
 *          (keeps existing mints). Needed before the program accepts USDT evaluation fees.
 * Note: admin_deposit only accepts the vault's primary mint, so this mints directly into the vault accounts.
 * Refuses mainnet RPC. Prints only public values.
 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction,
} from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getMint } from '@solana/spl-token';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const kpPath = args.find(a => !a.startsWith('--') && a.endsWith('.json'));
if (!kpPath) { console.error('usage: tsx scripts/fund-vault-tokens.ts <protocol-keypair.json> [--usdt-mint M] [--register-usdt] [--amount N] [--rpc URL]'); process.exit(1); }
const RPC = opt('--rpc') ?? 'https://api.devnet.solana.com';
if (/mainnet/i.test(RPC)) { console.error('Refusing mainnet RPC'); process.exit(1); }
const AMOUNT = BigInt(opt('--amount') ?? '100000') * 1_000_000n;

const PROGRAM_ID = new PublicKey('C3bvX2hkL76wXNobbyJPV5JpEPRFc3ksA4khR8WU9Rnk');
const USDC_MINT = new PublicKey('BpkjNnKSRCsNJMAMKtLs1jJCZpcnEh8ZqmMdRZA8QKBC');
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(kpPath, 'utf8'))));
const conn = new Connection(RPC, 'confirmed');
const disc = (n: string) => createHash('sha256').update(`global:${n}`).digest().subarray(0, 8);
const fmt = (n: bigint) => (Number(n) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2 });

async function main() {
  console.log('Signer:', admin.publicKey.toBase58());
  const [vaultState] = PublicKey.findProgramAddressSync([Buffer.from('vault_state')], PROGRAM_ID);
  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from('payout_vault'), vaultState.toBuffer()], PROGRAM_ID);
  const vs = await conn.getAccountInfo(vaultState);
  if (!vs) throw new Error('VaultState not found');
  const storedAdmin = new PublicKey(vs.data.subarray(8, 40));
  if (!storedAdmin.equals(admin.publicKey)) throw new Error('Signer is not the vault admin');

  // USDC
  const usdcInfo = await getMint(conn, USDC_MINT);
  if (!usdcInfo.mintAuthority || !usdcInfo.mintAuthority.equals(admin.publicKey)) throw new Error('Signer is not USDC mint authority');
  const usdcAta = await getOrCreateAssociatedTokenAccount(conn, admin, USDC_MINT, vaultPda, true);
  await mintTo(conn, admin, USDC_MINT, usdcAta.address, admin, AMOUNT);
  console.log(`USDC: minted ${fmt(AMOUNT)} into vault ATA ${usdcAta.address.toBase58()}`);

  // USDT
  const usdtMint = opt('--usdt-mint') ? new PublicKey(opt('--usdt-mint')!) : await createMint(conn, admin, admin.publicKey, admin.publicKey, 6);
  console.log('USDT test mint:', usdtMint.toBase58());
  const usdtAta = await getOrCreateAssociatedTokenAccount(conn, admin, usdtMint, vaultPda, true);
  await mintTo(conn, admin, usdtMint, usdtAta.address, admin, AMOUNT);
  console.log(`USDT: minted ${fmt(AMOUNT)} into vault ATA ${usdtAta.address.toBase58()}`);

  if (flag('--register-usdt')) {
    const n = vs.data.readUInt32LE(137);
    const mints: PublicKey[] = [];
    for (let i = 0; i < n; i++) mints.push(new PublicKey(vs.data.subarray(141 + 32 * i, 173 + 32 * i)));
    if (mints.some(m => m.equals(usdtMint))) console.log('USDT already in supported_mints');
    else {
      if (mints.length >= 5) throw new Error('supported_mints full');
      const all = [...mints, usdtMint];
      const len = Buffer.alloc(4); len.writeUInt32LE(all.length);
      const data = Buffer.concat([disc('update_config'), Buffer.from([0, 0, 1]), len, ...all.map(m => m.toBuffer())]);
      const ix = new TransactionInstruction({
        programId: PROGRAM_ID, data,
        keys: [
          { pubkey: vaultState, isSigner: false, isWritable: true },
          { pubkey: admin.publicKey, isSigner: true, isWritable: false },
        ],
      });
      const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [admin]);
      console.log('update_config tx:', sig, `(supported mints now ${all.length})`);
    }
  }

  const [u1, u2] = await Promise.all([conn.getTokenAccountBalance(usdcAta.address), conn.getTokenAccountBalance(usdtAta.address)]);
  console.log('\n== Vault balances now ==');
  console.log('USDC:', u1.value.uiAmountString, ' USDT:', u2.value.uiAmountString);
  console.log('\nUSDT_DEVNET_MINT =', usdtMint.toBase58());
}
main().catch(e => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
