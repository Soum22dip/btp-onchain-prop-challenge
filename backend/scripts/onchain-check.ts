/**
 * READ-ONLY on-chain audit of the Setl8 devnet deployment. Sends no transactions, needs no keypair.
 *
 *   pnpm exec tsx scripts/onchain-check.ts [trader-wallet] [rpc-url]
 *
 * Default RPC: public devnet. Refuses anything that looks like mainnet.
 */
import { Connection, PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('C3bvX2hkL76wXNobbyJPV5JpEPRFc3ksA4khR8WU9Rnk');
const PROTOCOL = new PublicKey('SL89fcsKAuWYtkEJah86WLLBxCiHd1DeNczpsDjSHDJ');
const MINT = new PublicKey('BpkjNnKSRCsNJMAMKtLs1jJCZpcnEh8ZqmMdRZA8QKBC');
const EXPECTED_PAYOUT_VAULT = new PublicKey('BMHggqxZUgjMEwev5z8YDbFsd6LvTFdZu2SB7B4n7Z1e');
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

const traderArg = process.argv[2] ?? '2CRtrRwLFsrpnBas5z3Hx9gCuuESWZfscE5L2QzK1TYK';
const rpc = process.argv[3] ?? 'https://api.devnet.solana.com';
if (/mainnet/i.test(rpc)) { console.error('Refusing mainnet RPC'); process.exit(1); }
const conn = new Connection(rpc, 'confirmed');

const ok = (b: boolean) => (b ? 'OK  ' : 'FAIL');
const results: string[] = [];
const check = (label: string, pass: boolean, extra = '') => {
  const line = `[${ok(pass)}] ${label}${extra ? '  ' + extra : ''}`;
  results.push(line); console.log(line);
};
const usdc = (n: bigint) => (Number(n) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2 });
const ata = (owner: PublicKey, mint: PublicKey) =>
  PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()], ATA_PROGRAM)[0];

async function tokenBal(addr: PublicKey): Promise<bigint | null> {
  const a = await conn.getAccountInfo(addr);
  if (!a) return null;
  return a.data.readBigUInt64LE(64);
}

class Rd {
  o = 0;
  constructor(public b: Buffer) {}
  skip(n: number) { this.o += n; }
  pk() { const v = new PublicKey(this.b.subarray(this.o, this.o + 32)); this.o += 32; return v; }
  u8() { return this.b[this.o++]; }
  bool() { return this.b[this.o++] === 1; }
  u16() { const v = this.b.readUInt16LE(this.o); this.o += 2; return v; }
  u32() { const v = this.b.readUInt32LE(this.o); this.o += 4; return v; }
  u64() { const v = this.b.readBigUInt64LE(this.o); this.o += 8; return v; }
  i64() { const v = this.b.readBigInt64LE(this.o); this.o += 8; return v; }
}

async function main() {
  console.log(`RPC: ${rpc.includes('api.devnet.solana.com') ? 'public devnet' : '(custom, hidden)'}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}\n`);

  // 1. Program
  console.log('== 1. Program ==');
  const prog = await conn.getAccountInfo(PROGRAM_ID);
  check('program account exists and is executable', !!prog && prog.executable);
  if (prog) {
    const pdata = new PublicKey(prog.data.subarray(4, 36));
    const pd = await conn.getAccountInfo(pdata);
    if (pd) {
      const slot = pd.data.readBigUInt64LE(4);
      const hasAuth = pd.data[12] === 1;
      const auth = hasAuth ? new PublicKey(pd.data.subarray(13, 45)) : null;
      console.log(`  last deployed slot: ${slot}, binary size: ${pd.data.length - 45} bytes (incl. padding)`);
      console.log(`  upgrade authority: ${auth ? auth.toBase58() : 'NONE (immutable)'}`);
      check('upgrade authority is the protocol wallet', !!auth && auth.equals(PROTOCOL));
    }
  }

  // 2. VaultState
  console.log('\n== 2. VaultState ==');
  const [vaultState] = PublicKey.findProgramAddressSync([Buffer.from('vault_state')], PROGRAM_ID);
  const [payoutVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('payout_vault'), vaultState.toBuffer()], PROGRAM_ID);
  console.log(`  vault_state PDA:  ${vaultState.toBase58()}`);
  console.log(`  payout_vault PDA: ${payoutVaultPda.toBase58()}`);
  check('payout vault PDA equals the address used in app constants', payoutVaultPda.equals(EXPECTED_PAYOUT_VAULT));
  const vs = await conn.getAccountInfo(vaultState);
  check('VaultState account exists, owned by program', !!vs && vs.owner.equals(PROGRAM_ID));
  let vTotals: { dep: bigint; paid: bigint; wd: bigint; queued: bigint } | null = null;
  if (vs) {
    const r = new Rd(vs.data); r.skip(8);
    const admin = r.pk(), protocol = r.pk(), payoutVault = r.pk(); const pvBump = r.u8();
    const usdcMint = r.pk(); const n = r.u32(); const mints: PublicKey[] = [];
    for (let i = 0; i < n; i++) mints.push(r.pk());
    const paused = r.bool();
    const dep = r.u64(), paid = r.u64(), wd = r.u64(), traders = r.u64();
    const feeProto = r.u16(), reserve = r.u16();
    const hb = r.i64(), hbOpen = r.bool(), hbRatio = r.u16(), queued = r.u64();
    const emerg = r.i64();
    vTotals = { dep, paid, wd, queued };
    console.log(`  admin:           ${admin.toBase58()}`);
    console.log(`  protocol_wallet: ${protocol.toBase58()}`);
    console.log(`  payout_vault:    ${payoutVault.toBase58()} (bump ${pvBump})`);
    console.log(`  usdc_mint:       ${usdcMint.toBase58()}`);
    console.log(`  supported mints: ${mints.length}`);
    console.log(`  paused=${paused}  trader_count=${traders}  fee_split_protocol_bps=${feeProto}  trader_reserve_bps=${reserve}`);
    console.log(`  total_deposited=${usdc(dep)}  total_paid_out=${usdc(paid)}  admin_total_withdrawn=${usdc(wd)}  queued_payouts=${usdc(queued)}`);
    console.log(`  heartbeat: open=${hbOpen} ratio_bps=${hbRatio} last=${hb}  emergency_requested_at=${emerg}`);
    check('admin is the protocol wallet', admin.equals(PROTOCOL));
    check('protocol_wallet is SL89', protocol.equals(PROTOCOL));
    check('stored payout_vault equals derived PDA', payoutVault.equals(payoutVaultPda));
    check('usdc_mint equals test mint', usdcMint.equals(MINT));
    check('test mint is in supported mints', mints.some(m => m.equals(MINT)));
    check('vault not paused, no emergency withdraw pending', !paused && emerg === 0n);
    check('fee split 35% protocol / 25% reserve', feeProto === 3500 && reserve === 2500);
  }

  // 3. Mint + vault balance
  console.log('\n== 3. Mint and payout vault ==');
  const mintAcc = await conn.getAccountInfo(MINT);
  check('mint exists, owned by SPL Token program', !!mintAcc && mintAcc.owner.equals(TOKEN_PROGRAM));
  if (mintAcc) {
    const hasAuth = mintAcc.data.readUInt32LE(0) === 1;
    const auth = hasAuth ? new PublicKey(mintAcc.data.subarray(4, 36)) : null;
    const supply = mintAcc.data.readBigUInt64LE(36); const dec = mintAcc.data[44];
    console.log(`  decimals=${dec}  supply=${usdc(supply)}  mint authority=${auth ? auth.toBase58() : 'none'}`);
    check('mint has 6 decimals', dec === 6);
  }
  const vaultAta = ata(payoutVaultPda, MINT);
  console.log(`  vault token account (ATA of the PDA): ${vaultAta.toBase58()}`);
  const vaultBal = await tokenBal(vaultAta);
  check('payout vault token account exists', vaultBal !== null, vaultBal !== null ? `balance ${usdc(vaultBal)} USDC` : '');
  if (vaultBal !== null && vTotals) {
    const expected = vTotals.dep - vTotals.paid - vTotals.wd;
    console.log(`  accounting: deposited - paid_out - admin_withdrawn = ${usdc(expected)}  vs  token balance ${usdc(vaultBal)}`);
    console.log('  (they differ if tokens were sent straight to the vault ATA, or if admin_deposit is not counted in total_deposited; informational)');
    check('vault balance covers queued payouts', vaultBal >= vTotals.queued, `queued ${usdc(vTotals.queued)}`);
  }

  // 4. Wallets
  console.log('\n== 4. Wallet balances ==');
  const trader = new PublicKey(traderArg);
  for (const [name, w] of [['protocol SL89', PROTOCOL], ['demo trader', trader]] as const) {
    const sol = await conn.getBalance(w);
    const tb = await tokenBal(ata(w, MINT));
    console.log(`  ${name}: ${(sol / 1e9).toFixed(4)} SOL, ${tb === null ? 'no USDC account' : usdc(tb) + ' test USDC'}`);
  }
  const protoSol = await conn.getBalance(PROTOCOL);
  check('protocol wallet has SOL for fees (>= 0.5)', protoSol >= 0.5e9, `${(protoSol / 1e9).toFixed(3)} SOL`);

  // 5. Trader PDA
  console.log('\n== 5. TraderAccount for demo wallet ==');
  const [traderPda] = PublicKey.findProgramAddressSync([Buffer.from('trader'), trader.toBuffer()], PROGRAM_ID);
  const ta = await conn.getAccountInfo(traderPda);
  console.log(`  PDA: ${traderPda.toBase58()}`);
  if (!ta) console.log('  (no on-chain trader account yet: normal until a challenge fee is deposited on-chain)');
  else {
    const r = new Rd(ta.data); r.skip(8);
    const wallet = r.pk(); const phase = r.u8(); const status = r.u8();
    const size = r.u64(), dep = r.u64(), paid = r.u64(), pp = r.u8(), pf = r.u8(), created = r.i64();
    const phases = ['Evaluation', 'Funded1', 'Funded2', 'Funded3', 'Funded4', 'Funded5'];
    const statuses = ['Active', 'Passed', 'Failed', 'Graduated'];
    console.log(`  wallet=${wallet.toBase58()} phase=${phases[phase] ?? phase} status=${statuses[status] ?? status}`);
    console.log(`  account_size=${usdc(size)} total_deposited=${usdc(dep)} total_paid_out=${usdc(paid)} passed=${pp} failed=${pf} created=${new Date(Number(created) * 1000).toISOString()}`);
    check('trader account wallet matches', wallet.equals(trader));
  }

  // 6. Transactions
  console.log('\n== 6. Recent transactions (program-level, newest first) ==');
  const sigs = await conn.getSignaturesForAddress(PROGRAM_ID, { limit: 25 });
  let failed = 0;
  for (const s of sigs) {
    if (s.err) failed++;
    console.log(`  ${s.err ? 'FAILED ' : 'ok     '} ${new Date((s.blockTime ?? 0) * 1000).toISOString()}  ${s.signature.slice(0, 20)}...${s.signature.slice(-6)}`);
  }
  console.log(`  ${sigs.length} shown, ${failed} failed`);
  const names = new Map<string, number>();
  for (const s of sigs.filter(x => !x.err).slice(0, 12)) {
    const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    const logs = tx?.meta?.logMessages ?? [];
    const ix = logs.find(l => l.startsWith('Program log: Instruction:'))?.replace('Program log: Instruction: ', '') ?? 'unknown';
    names.set(ix, (names.get(ix) ?? 0) + 1);
  }
  console.log('  instruction mix (last 12 successful): ' + [...names].map(([k, v]) => `${k}x${v}`).join(', '));

  console.log('\n== Summary ==');
  const bad = results.filter(r => r.startsWith('[FAIL]'));
  console.log(`${results.length - bad.length}/${results.length} checks passed`);
  bad.forEach(b => console.log(b));
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
