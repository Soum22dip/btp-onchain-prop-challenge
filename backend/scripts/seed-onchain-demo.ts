/**
 * Devnet only. Generates REAL on-chain activity on the Setl8 vault with fresh test wallets:
 * fee deposits, evaluation passes/fails, funded passes with queued payouts, and (once the
 * contract's 5-day heartbeat window is open) heartbeat + payout processing.
 *
 *   pnpm exec tsx scripts/seed-onchain-demo.ts <protocol-keypair.json> [--payouts] [--rpc URL]
 *
 * HONESTY NOTE: transactions are real and verifiable on devnet, but the trader RESULTS
 * (balances, trade counts, drawdown) are scripted demonstration values, not produced by live trading.
 * Safe to re-run: each step is decided from the current on-chain state.
 * Test wallets are stored OUTSIDE the repo in ~/.config/solana/setl8-demo-wallets/. Prints public values only.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, mintTo, getAccount } from '@solana/spl-token';

const args = process.argv.slice(2);
const kpPath = args.find(a => a.endsWith('.json'));
const rpcIdx = args.indexOf('--rpc');
const RPC = rpcIdx >= 0 ? args[rpcIdx + 1] : 'https://api.devnet.solana.com';
const DO_PAYOUTS = args.includes('--payouts');
// --try-open: skip the local 5-day check and let the on-chain program decide (needed for a demo build with a short interval)
const TRY_OPEN = args.includes('--try-open');
if (!kpPath) { console.error('usage: tsx scripts/seed-onchain-demo.ts <protocol-keypair.json> [--payouts] [--rpc URL]'); process.exit(1); }
if (/mainnet/i.test(RPC)) { console.error('Refusing mainnet RPC'); process.exit(1); }

const PROGRAM_ID = new PublicKey('C3bvX2hkL76wXNobbyJPV5JpEPRFc3ksA4khR8WU9Rnk');
const USDC = new PublicKey('BpkjNnKSRCsNJMAMKtLs1jJCZpcnEh8ZqmMdRZA8QKBC');
const HEARTBEAT_INTERVAL = 432_000;
const M = 1_000_000;
const FEE_USDC: Record<number, number> = { 10_000: 99, 25_000: 235, 75_000: 599 }; // from packages/constants tiers

type Plan = { name: string; size: number; kind: 'pass' | 'fail'; fundedPasses: number };
const PLANS: Plan[] = [
  { name: 'demo-trader-1', size: 10_000, kind: 'pass', fundedPasses: 1 },
  { name: 'demo-trader-2', size: 25_000, kind: 'pass', fundedPasses: 1 },
  { name: 'demo-trader-3', size: 75_000, kind: 'pass', fundedPasses: 2 },
  { name: 'demo-trader-4', size: 10_000, kind: 'fail', fundedPasses: 0 },
  { name: 'demo-trader-5', size: 25_000, kind: 'pass', fundedPasses: 0 }, // passed evaluation, now Funded1, no payout yet
];

const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(kpPath, 'utf8'))));
const conn = new Connection(RPC, 'confirmed');
const disc = (n: string) => createHash('sha256').update(`global:${n}`).digest().subarray(0, 8);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const u64 = (n: number | bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const [vaultState] = PublicKey.findProgramAddressSync([Buffer.from('vault_state')], PROGRAM_ID);
const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from('payout_vault'), vaultState.toBuffer()], PROGRAM_ID);
const traderPda = (w: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from('trader'), w.toBuffer()], PROGRAM_ID)[0];
const phasePda = (w: PublicKey, p: number) => PublicKey.findProgramAddressSync([Buffer.from('phase_result'), w.toBuffer(), Buffer.from([p])], PROGRAM_ID)[0];
const payoutPda = (w: PublicKey, p: number) => PublicKey.findProgramAddressSync([Buffer.from('payout'), w.toBuffer(), Buffer.from([p])], PROGRAM_ID)[0];
const ex = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const exa = (a: PublicKey) => `https://explorer.solana.com/address/${a.toBase58()}?cluster=devnet`;
const usd = (n: number | bigint) => (Number(n) / M).toLocaleString('en-US', { minimumFractionDigits: 2 });

async function send(label: string, ixs: TransactionInstruction[], signers: Keypair[]) {
  const tx = new Transaction().add(...ixs);
  const sig = await sendAndConfirmTransaction(conn, tx, signers, { commitment: 'confirmed' });
  console.log(`    ${label}\n      ${ex(sig)}`);
  await sleep(500);
  return sig;
}

class Rd {
  o = 0; constructor(public b: Buffer) {}
  skip(n: number) { this.o += n; }
  pk() { const v = new PublicKey(this.b.subarray(this.o, this.o + 32)); this.o += 32; return v; }
  u8() { return this.b[this.o++]; }
  u32() { const v = this.b.readUInt32LE(this.o); this.o += 4; return v; }
  u64() { const v = this.b.readBigUInt64LE(this.o); this.o += 8; return v; }
  i64() { const v = this.b.readBigInt64LE(this.o); this.o += 8; return v; }
  u16() { const v = this.b.readUInt16LE(this.o); this.o += 2; return v; }
}
async function readTrader(w: PublicKey) {
  const a = await conn.getAccountInfo(traderPda(w));
  if (!a) return null;
  const r = new Rd(a.data); r.skip(8); r.pk();
  const phase = r.u8(), status = r.u8(), size = r.u64(), dep = r.u64(), paid = r.u64(), passed = r.u8(), failed = r.u8();
  return { phase, status, size, dep, paid, passed, failed };
}
async function readVault() {
  const a = await conn.getAccountInfo(vaultState); if (!a) throw new Error('no VaultState');
  const r = new Rd(a.data); r.skip(8); r.pk(); r.pk(); r.pk(); r.u8(); r.pk();
  const n = r.u32(); r.skip(32 * n); r.skip(1);
  r.u64(); r.u64(); r.u64(); r.u64(); r.u16(); r.u16();
  const lastHb = r.i64(); const open = r.u8() === 1; r.u16(); const queued = r.u64();
  return { lastHb: Number(lastHb), open, queued };
}
const chainNow = async () => (await conn.getBlockTime(await conn.getSlot())) ?? Math.floor(Date.now() / 1000);

function resultHash(w: PublicKey, start: number, end: number, pnl: number, trades: number, passed: boolean) {
  const pnlB = Buffer.alloc(8); pnlB.writeBigInt64LE(BigInt(pnl));
  const tB = Buffer.alloc(4); tB.writeUInt32LE(trades);
  return createHash('sha256').update(Buffer.concat([w.toBuffer(), u64(start), u64(end), pnlB, tB, Buffer.from([passed ? 1 : 0])])).digest();
}
function makeResult(w: PublicKey, idx: number, phase: number, size: number, passed: boolean) {
  const n = idx * 7 + phase * 3 + 1;
  const start = size * M;
  let end: number, trades: number, wins: number, dd: number;
  if (passed) {
    end = Math.round(start * (10_000 + 810 + ((n * 37) % 300)) / 10_000);
    trades = 14 + ((n * 5) % 17); wins = Math.floor(trades * 0.6) + (n % 2); dd = 150 + ((n * 41) % 230);
  } else {
    end = Math.round(start * (10_000 - (810 + ((n * 29) % 120))) / 10_000);
    trades = 7 + (n % 6); wins = n % 3; dd = 810 + ((n * 17) % 120);
  }
  const pnl = end - start;
  return { start, end, pnl, trades, wins, dd, mode: phase > 0 ? 1 : 0, peak: passed ? end : start, hash: resultHash(w, start, end, pnl, trades, passed) };
}
function resultData(disc8: Buffer, r: ReturnType<typeof makeResult>, passed?: boolean) {
  const parts: Buffer[] = [disc8];
  if (passed !== undefined) parts.push(Buffer.from([passed ? 1 : 0]));
  const pnlB = Buffer.alloc(8); pnlB.writeBigInt64LE(BigInt(r.pnl));
  const t = Buffer.alloc(4); t.writeUInt32LE(r.trades); const wn = Buffer.alloc(4); wn.writeUInt32LE(r.wins);
  const d = Buffer.alloc(2); d.writeUInt16LE(r.dd);
  parts.push(u64(r.start), u64(r.end), pnlB, t, wn, d, Buffer.from([r.mode]), u64(r.peak), r.hash);
  return Buffer.concat(parts);
}

async function main() {
  console.log('Signer (vault admin / protocol):', admin.publicKey.toBase58());
  console.log('NOTE: transactions are real; trader results are SCRIPTED demo values, not live trading.\n');
  const walletsDir = path.join(os.homedir(), '.config', 'solana', 'setl8-demo-wallets');
  fs.mkdirSync(walletsDir, { recursive: true });
  const protocolAta = (await getOrCreateAssociatedTokenAccount(conn, admin, USDC, admin.publicKey)).address;
  const vaultAta = (await getOrCreateAssociatedTokenAccount(conn, admin, USDC, vaultPda, true)).address;

  const wallets: { plan: Plan; kp: Keypair }[] = [];
  for (let i = 0; i < PLANS.length; i++) {
    const p = path.join(walletsDir, `${PLANS[i].name}.json`);
    let kp: Keypair;
    if (fs.existsSync(p)) kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, 'utf8'))));
    else { kp = Keypair.generate(); fs.writeFileSync(p, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 }); }
    wallets.push({ plan: PLANS[i], kp });
  }

  if (!DO_PAYOUTS) {
    for (let i = 0; i < wallets.length; i++) {
      const { plan, kp } = wallets[i];
      const w = kp.publicKey;
      console.log(`== ${plan.name}  ${w.toBase58()}  (${usd(plan.size * M)} account, plan: ${plan.kind}${plan.fundedPasses ? ` + ${plan.fundedPasses} funded pass(es)` : ''})`);
      try {
        // SOL for fees and rent
        if ((await conn.getBalance(w)) < 0.03e9) {
          await send('fund 0.03 SOL for tx fees', [SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: w, lamports: 0.03e9 })], [admin]);
        }
        let t = await readTrader(w);
        if (!t) {
          const fee = FEE_USDC[plan.size]; if (!fee) throw new Error('no fee tier');
          const traderAta = (await getOrCreateAssociatedTokenAccount(conn, admin, USDC, w)).address;
          const bal = (await getAccount(conn, traderAta)).amount;
          if (bal < BigInt(fee * M)) await mintTo(conn, admin, USDC, traderAta, admin, BigInt(fee * M) - bal);
          const data = Buffer.concat([disc('deposit_evaluation_fee'), u64(fee * M), u64(plan.size * M)]);
          const ix = new TransactionInstruction({
            programId: PROGRAM_ID, data,
            keys: [
              { pubkey: vaultState, isSigner: false, isWritable: true },
              { pubkey: traderPda(w), isSigner: false, isWritable: true },
              { pubkey: w, isSigner: true, isWritable: true },
              { pubkey: traderAta, isSigner: false, isWritable: true },
              { pubkey: protocolAta, isSigner: false, isWritable: true },
              { pubkey: vaultAta, isSigner: false, isWritable: true },
              { pubkey: USDC, isSigner: false, isWritable: false },
              { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
          });
          await send(`deposit_evaluation_fee ${fee} USDC (35% protocol / 65% vault)`, [ix], [kp]);
          t = await readTrader(w);
        }
        if (!t) throw new Error('trader account missing after deposit');

        const wanted = plan.kind === 'pass' ? 1 + plan.fundedPasses : 0;
        const doOne = async () => {
          const cur = (await readTrader(w))!;
          const phase = cur.phase; const passed = plan.kind === 'pass';
          const r = makeResult(w, i + 1, phase, plan.size, passed);
          if (phase === 0) {
            const ix = new TransactionInstruction({
              programId: PROGRAM_ID, data: resultData(disc('submit_result_no_payout'), r, passed),
              keys: [
                { pubkey: vaultState, isSigner: false, isWritable: false },
                { pubkey: traderPda(w), isSigner: false, isWritable: true },
                { pubkey: phasePda(w, 0), isSigner: false, isWritable: true },
                { pubkey: admin.publicKey, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
              ],
            });
            await send(`submit_result_no_payout  evaluation ${passed ? 'PASSED' : 'FAILED'}  end ${usd(r.end)} pnl ${usd(r.pnl)} dd ${r.dd}bps`, [ix], [admin]);
          } else {
            const ix = new TransactionInstruction({
              programId: PROGRAM_ID, data: resultData(disc('submit_result_with_payout'), r),
              keys: [
                { pubkey: vaultState, isSigner: false, isWritable: true },
                { pubkey: traderPda(w), isSigner: false, isWritable: true },
                { pubkey: phasePda(w, phase), isSigner: false, isWritable: true },
                { pubkey: payoutPda(w, phase), isSigner: false, isWritable: true },
                { pubkey: admin.publicKey, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
              ],
            });
            await send(`submit_result_with_payout  funded phase ${phase} PASSED  payout queued ${usd(plan.size * 800 / 10_000 * M)} USDC`, [ix], [admin]);
          }
        };
        if (plan.kind === 'fail') {
          if (t.status === 0 && t.phase === 0 && t.failed === 0) await doOne(); else console.log('    (failure already recorded)');
        } else {
          while (t.status === 0 && t.passed < wanted) { await doOne(); t = (await readTrader(w))!; }
          if (t.passed >= wanted) console.log(`    done: ${t.passed} phase(s) passed`);
        }
      } catch (e) { console.log(`    STOPPED: ${(e as Error).message}`); }
      console.log();
    }
  }

  // Payout processing (permissionless instructions, gated by the contract's 5-day heartbeat)
  if (DO_PAYOUTS) {
    let v = await readVault(); const now = await chainNow();
    const opensAt = v.lastHb + HEARTBEAT_INTERVAL;
    console.log(`Queued payouts: ${usd(v.queued)} USDC   heartbeat open=${v.open}`);
    if (!v.open && now < opensAt && !TRY_OPEN) {
      console.log(`Heartbeat cannot open yet. Opens at ${new Date(opensAt * 1000).toISOString()} (UTC). Re-run with --payouts after that (or --payouts --try-open to let the contract decide).`);
    } else {
      if (!v.open) {
        await send('process_heartbeat_open',
          [new TransactionInstruction({ programId: PROGRAM_ID, data: Buffer.from(disc('process_heartbeat_open')),
            keys: [{ pubkey: vaultState, isSigner: false, isWritable: true }, { pubkey: vaultAta, isSigner: false, isWritable: false }] })], [admin]);
        v = await readVault();
      }
      if (v.open) {
        for (const { plan, kp } of wallets) {
          const w = kp.publicKey; const traderAta = (await getOrCreateAssociatedTokenAccount(conn, admin, USDC, w)).address;
          for (let p = 1; p <= plan.fundedPasses; p++) {
            const pa = await conn.getAccountInfo(payoutPda(w, p)); if (!pa) continue;
            const status = pa.data[8 + 32 + 1 + 8 + 8 + 32];
            if (status === 2) { console.log(`  ${plan.name} phase ${p}: already paid`); continue; }
            const ix = new TransactionInstruction({
              programId: PROGRAM_ID, data: Buffer.from(disc('process_payout')),
              keys: [
                { pubkey: vaultState, isSigner: false, isWritable: true },
                { pubkey: payoutPda(w, p), isSigner: false, isWritable: true },
                { pubkey: traderPda(w), isSigner: false, isWritable: true },
                { pubkey: vaultPda, isSigner: false, isWritable: false },
                { pubkey: vaultAta, isSigner: false, isWritable: true },
                { pubkey: traderAta, isSigner: false, isWritable: true },
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
              ],
            });
            try { await send(`process_payout  ${plan.name} phase ${p}`, [ix], [admin]); } catch (e) { console.log(`    payout failed: ${(e as Error).message}`); }
          }
        }
        await send('process_heartbeat_close',
          [new TransactionInstruction({ programId: PROGRAM_ID, data: Buffer.from(disc('process_heartbeat_close')),
            keys: [{ pubkey: vaultState, isSigner: false, isWritable: true }] })], [admin]);
      }
    }
  }

  console.log('\n== Test wallets (public addresses) ==');
  for (const { plan, kp } of wallets) {
    const t = await readTrader(kp.publicKey);
    const phases = ['Evaluation', 'Funded1', 'Funded2', 'Funded3', 'Funded4', 'Funded5'];
    const st = ['Active', 'Passed', 'Failed', 'Graduated'];
    console.log(`  ${plan.name}  ${exa(kp.publicKey)}`);
    if (t) console.log(`    phase=${phases[t.phase]} status=${st[t.status]} passed=${t.passed} failed=${t.failed} paid_out=${usd(t.paid)} deposited=${usd(t.dep)}`);
  }
  const v = await readVault();
  console.log(`\nVault: queued payouts ${usd(v.queued)} USDC, heartbeat open=${v.open}`);
  console.log('Next: pnpm exec tsx scripts/onchain-ledger.ts and scripts/onchain-check.ts for the full audit trail.');
}
main().catch(e => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
