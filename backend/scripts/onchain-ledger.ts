/**
 * READ-ONLY ledger of everything that touched the Setl8 devnet vault. No keypair, no transactions.
 *
 *   pnpm exec tsx scripts/onchain-ledger.ts [trader-wallet] [usdt-mint] [rpc-url]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('C3bvX2hkL76wXNobbyJPV5JpEPRFc3ksA4khR8WU9Rnk');
const USDC = 'BpkjNnKSRCsNJMAMKtLs1jJCZpcnEh8ZqmMdRZA8QKBC';
const trader = new PublicKey(process.argv[2] ?? '2CRtrRwLFsrpnBas5z3Hx9gCuuESWZfscE5L2QzK1TYK');
const USDT = process.argv[3] ?? 'DUSEWvebBYATV5iUxwgKXPEwCQuCUjBfYCxeUiuN7RLR';
const rpc = process.argv[4] ?? 'https://api.devnet.solana.com';
if (/mainnet/i.test(rpc)) { console.error('Refusing mainnet RPC'); process.exit(1); }
const conn = new Connection(rpc, 'confirmed');
const TOKEN = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATAP = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const ata = (o: PublicKey, m: string) => PublicKey.findProgramAddressSync([o.toBuffer(), TOKEN.toBuffer(), new PublicKey(m).toBuffer()], ATAP)[0];

const [vaultState] = PublicKey.findProgramAddressSync([Buffer.from('vault_state')], PROGRAM_ID);
const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from('payout_vault'), vaultState.toBuffer()], PROGRAM_ID);
const labels = new Map<string, string>([
  ['SL89fcsKAuWYtkEJah86WLLBxCiHd1DeNczpsDjSHDJ', 'protocol(SL89)'],
  [vaultPda.toBase58(), 'vaultPDA'],
  [trader.toBase58(), 'trader'],
]);
// demo wallets created by seed-onchain-demo.ts (public keys only are used)
const demoWallets: { name: string; pk: PublicKey }[] = [];
try {
  const dir = path.join(os.homedir(), '.config', 'solana', 'setl8-demo-wallets');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')).sort()) {
    const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))));
    demoWallets.push({ name: f.replace('.json', ''), pk: kp.publicKey });
    labels.set(kp.publicKey.toBase58(), f.replace('.json', ''));
  }
} catch { /* no demo wallets yet */ }
const mintName = (m: string) => (m === USDC ? 'USDC' : m === USDT ? 'USDT' : m.slice(0, 6));
const who = (o?: string) => (o ? labels.get(o) ?? o.slice(0, 6) + '..' : '?');
const progNames: Record<string, string> = {
  [PROGRAM_ID.toBase58()]: 'setl8-vault',
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 'spl-token',
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 'ata',
  '11111111111111111111111111111111': 'system',
  BPFLoaderUpgradeab1e11111111111111111111111: 'bpf-upgradeable-loader',
  ComputeBudget111111111111111111111111111111: 'compute-budget',
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log(`Vault state PDA: ${vaultState.toBase58()}\nPayout vault PDA: ${vaultPda.toBase58()}\n`);
  const addrs = [PROGRAM_ID, ata(vaultPda, USDC), ata(vaultPda, USDT)];
  const all = new Map<string, { signature: string; blockTime?: number | null; err: unknown }>();
  for (const a of addrs) {
    const s = await conn.getSignaturesForAddress(a, { limit: 50 });
    s.forEach(x => all.set(x.signature, x));
    await sleep(300);
  }
  const sigs = [...all.values()].sort((a, b) => (a.blockTime ?? 0) - (b.blockTime ?? 0));
  console.log(`${sigs.length} transactions (oldest first)\n`);
  let i = 0;
  for (const s of sigs) {
    i++;
    await sleep(350);
    const tx = await conn.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
    if (!tx) { console.log(`#${i} ${s.signature} (not retrievable)\n`); continue; }
    const when = new Date((tx.blockTime ?? 0) * 1000).toISOString();
    const progs = [...new Set(tx.transaction.message.instructions.map(ix => progNames[ix.programId.toBase58()] ?? ix.programId.toBase58().slice(0, 6)))];
    const logs = tx.meta?.logMessages ?? [];
    const ixs = logs.filter(l => l.startsWith('Program log: Instruction:')).map(l => l.replace('Program log: Instruction: ', ''));
    const payer = tx.transaction.message.accountKeys[0].pubkey.toBase58();
    console.log(`#${i} ${tx.meta?.err ? 'FAILED' : 'ok'}  ${when}  slot ${tx.slot}`);
    console.log(`   sig:      ${s.signature}`);
    console.log(`   explorer: https://explorer.solana.com/tx/${s.signature}?cluster=devnet`);
    console.log(`   signer/fee payer: ${who(payer)}  fee ${(tx.meta?.fee ?? 0) / 1e9} SOL`);
    console.log(`   programs: ${progs.join(', ')}   instructions: ${ixs.join(' > ') || '(no anchor/spl log)'}`);
    // token deltas per (owner, mint)
    const d = new Map<string, bigint>();
    const add = (b: any, sign: bigint) => { const k = `${who(b.owner)}|${mintName(b.mint)}`; d.set(k, (d.get(k) ?? 0n) + sign * BigInt(b.uiTokenAmount.amount)); };
    (tx.meta?.preTokenBalances ?? []).forEach(b => add(b, -1n));
    (tx.meta?.postTokenBalances ?? []).forEach(b => add(b, 1n));
    for (const [k, v] of d) if (v !== 0n) {
      const [o, m] = k.split('|');
      console.log(`   token: ${o.padEnd(16)} ${m.padEnd(6)} ${v > 0n ? '+' : '-'}${(Number(v < 0n ? -v : v) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    }
    console.log();
  }

  // PhaseResult + PayoutRequest records for every known trader
  const traders = [{ name: 'trader(arg)', pk: trader }, ...demoWallets.filter(d => !d.pk.equals(trader))];
  const f6 = (n: bigint) => (Number(n) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2 });
  console.log('== PhaseResult records (permanent on-chain results) ==');
  for (const t of traders) {
    for (let phase = 0; phase < 6; phase++) {
      const [pda] = PublicKey.findProgramAddressSync([Buffer.from('phase_result'), t.pk.toBuffer(), Buffer.from([phase])], PROGRAM_ID);
      const a = await conn.getAccountInfo(pda);
      if (!a) continue;
      await sleep(250);
      const b = a.data; let o = 8 + 32; const ph = b[o]; o += 1;
      const u64 = () => { const v = b.readBigUInt64LE(o); o += 8; return v; };
      const size = u64(), start = u64(), end = u64(); const pnl = b.readBigInt64LE(o); o += 8;
      const trades = b.readUInt32LE(o); o += 4; const wins = b.readUInt32LE(o); o += 4;
      const dd = b.readUInt16LE(o); o += 2; const ddMode = b[o]; o += 1;
      const peak = u64(), payout = u64(); const passed = b[o] === 1; o += 1;
      const hash = Buffer.from(b.subarray(o, o + 32)).toString('hex'); o += 32;
      const at = b.readBigInt64LE(o);
      console.log(`  ${t.name} (${t.pk.toBase58().slice(0, 6)}..) phase ${ph}  ${passed ? 'PASSED' : 'FAILED'}  PDA ${pda.toBase58()}`);
      console.log(`    account=${f6(size)} start=${f6(start)} end=${f6(end)} pnl=${f6(pnl)} peak=${f6(peak)} payout=${f6(payout)} trades=${trades} wins=${wins} dd=${dd}bps ${ddMode === 1 ? 'trailing' : 'static'} at=${new Date(Number(at) * 1000).toISOString()}`);
      console.log(`    result_hash=${hash}`);
    }
  }
  console.log('\n== PayoutRequest records ==');
  let sumAmt = 0n, sumPaid = 0n;
  for (const t of traders) {
    for (let phase = 1; phase < 6; phase++) {
      const [pda] = PublicKey.findProgramAddressSync([Buffer.from('payout'), t.pk.toBuffer(), Buffer.from([phase])], PROGRAM_ID);
      const a = await conn.getAccountInfo(pda);
      if (!a) continue;
      await sleep(250);
      const b = a.data; const amount = b.readBigUInt64LE(8 + 32 + 1); const paid = b.readBigUInt64LE(8 + 32 + 1 + 8);
      const st = ['Queued', 'PartiallyPaid', 'Completed'][b[8 + 32 + 1 + 8 + 8 + 32]] ?? '?';
      sumAmt += amount; sumPaid += paid;
      console.log(`  ${t.name} phase ${phase}: ${st}  amount=${f6(amount)} paid=${f6(paid)}  PDA ${pda.toBase58()}`);
    }
  }
  console.log(`  total queued/paid: ${f6(sumAmt)} / ${f6(sumPaid)} USDC`);
  console.log('\nDone. Open the explorer links above and compare signer, programs and token deltas with this ledger.');
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
