// =============================================================================
// Setl8 Vault — PDA-based Anchor Smart Contract (v2)
// Network: Solana Devnet → Mainnet
//
// Architecture:
//   PDA-controlled payout vault. Traders buy challenges with USDC
//   (fee splits 35% protocol / 65% vault). Backend submits pass/fail results
//   with full phase data stored permanently on-chain. On funded pass, payouts
//   are AUTO-QUEUED at exactly 8% of account size. Every 5 days, a
//   PERMISSIONLESS heartbeat opens and anyone can process queued payouts
//   with pro-rata distribution if vault is deficient.
//
// Instructions:
//   1.  initialize                  — deploy vault, set admin/config
//   2.  deposit_evaluation_fee      — trader pays fee, split 35/65
//   3.  submit_result_no_payout     — admin submits result (eval or funded fail)
//   4.  submit_result_with_payout   — admin submits funded pass (auto-queues payout)
//   5.  process_heartbeat_open      — permissionless: opens 5-day payout window
//   6.  process_payout              — permissionless: pays trader pro-rata
//   7.  process_heartbeat_close     — permissionless: closes payout window
//   8.  admin_withdraw              — admin withdraws (respects reserve + queue)
//   9.  admin_deposit               — admin deposits into vault
//   10. request_emergency_withdraw  — start 48h timelock
//   11. execute_emergency_withdraw  — drain vault after timelock
//   12. cancel_emergency_withdraw   — cancel pending emergency
//   13. unpause                     — resume after emergency
//   14. update_config               — update protocol parameters
//   15. force_close_vault_state     — devnet migration only
//
// Accounts:
//   VaultState      (PDA: ["vault_state"])                              — global singleton
//   TraderAccount   (PDA: ["trader", trader_wallet])                    — per trader
//   PhaseResult     (PDA: ["phase_result", trader_wallet, phase_byte])  — per phase result
//   PayoutRequest   (PDA: ["payout", trader_wallet, phase_byte])        — per payout
//   Payout Vault    (PDA: ["payout_vault", vault_state])                — token authority
// =============================================================================

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("C3bvX2hkL76wXNobbyJPV5JpEPRFc3ksA4khR8WU9Rnk");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL: i64 = 5 * 24 * 60 * 60; // 432,000 seconds (5 days)
const PAYOUT_BPS: u16 = 800;                        // 8% per funded phase
const _MAX_CUMULATIVE_PAYOUT_BPS: u16 = 4000;       // 40% total (5 x 8%)
const EMERGENCY_TIMELOCK: i64 = 172_800;             // 48 hours

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Phase {
    Evaluation, // phase 0 — no payout
    Funded1,    // phase 1 — 8% payout on pass
    Funded2,    // phase 2
    Funded3,    // phase 3
    Funded4,    // phase 4
    Funded5,    // phase 5 — final, then graduation
}

impl Phase {
    pub fn number(&self) -> u8 {
        match self {
            Phase::Evaluation => 0,
            Phase::Funded1 => 1,
            Phase::Funded2 => 2,
            Phase::Funded3 => 3,
            Phase::Funded4 => 4,
            Phase::Funded5 => 5,
        }
    }

    pub fn next(&self) -> Option<Phase> {
        match self {
            Phase::Evaluation => Some(Phase::Funded1),
            Phase::Funded1 => Some(Phase::Funded2),
            Phase::Funded2 => Some(Phase::Funded3),
            Phase::Funded3 => Some(Phase::Funded4),
            Phase::Funded4 => Some(Phase::Funded5),
            Phase::Funded5 => None, // graduation
        }
    }

    pub fn is_funded(&self) -> bool {
        !matches!(self, Phase::Evaluation)
    }
}

impl Default for Phase {
    fn default() -> Self {
        Phase::Evaluation
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TraderStatus {
    Active,
    Passed,
    Failed,
    Graduated,
}

impl Default for TraderStatus {
    fn default() -> Self {
        TraderStatus::Active
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PayoutStatus {
    Queued,
    PartiallyPaid,
    Completed,
}

impl Default for PayoutStatus {
    fn default() -> Self {
        PayoutStatus::Queued
    }
}

// ---------------------------------------------------------------------------
// State Accounts
// ---------------------------------------------------------------------------

/// Global vault singleton.  PDA seeds: [b"vault_state"].
#[account]
#[derive(InitSpace)]
pub struct VaultState {
    pub admin: Pubkey,
    pub protocol_wallet: Pubkey,
    pub payout_vault: Pubkey,
    pub payout_vault_bump: u8,
    pub usdc_mint: Pubkey,
    #[max_len(5)]
    pub supported_mints: Vec<Pubkey>,
    pub paused: bool,

    // Counters
    pub total_deposited: u64,
    pub total_paid_out: u64,
    pub admin_total_withdrawn: u64,
    pub trader_count: u64,

    // Config
    pub fee_split_protocol_bps: u16, // 3500 = 35%
    pub trader_reserve_bps: u16,     // 2500 = 25%

    // Heartbeat
    pub last_heartbeat_at: i64,
    pub heartbeat_open: bool,
    pub heartbeat_ratio_bps: u16,          // 10000 = full pay, 5000 = 50%
    pub total_queued_payout_amount: u64,

    // Emergency
    pub emergency_withdraw_requested_at: i64,

    pub bump: u8,
}

/// Per-trader account.  PDA seeds: [b"trader", trader_wallet].
#[account]
#[derive(InitSpace)]
pub struct TraderAccount {
    pub wallet: Pubkey,
    pub current_phase: Phase,
    pub status: TraderStatus,
    pub account_size: u64,
    pub total_deposited: u64,
    pub total_paid_out: u64,
    pub phases_passed: u8,
    pub phases_failed: u8,
    pub created_at: i64,
    pub bump: u8,
}

/// Permanent on-chain record per phase.
/// PDA seeds: [b"phase_result", trader_wallet, phase_byte].
#[account]
#[derive(InitSpace)]
pub struct PhaseResult {
    pub trader: Pubkey,
    pub phase: Phase,
    pub account_size: u64,
    pub starting_balance: u64,
    pub ending_balance: u64,
    pub realized_pnl: i64,
    pub total_trades: u32,
    pub winning_trades: u32,
    pub max_drawdown_used_bps: u16,
    pub drawdown_mode_at_end: u8, // 0=static, 1=trailing
    pub peak_balance: u64,
    pub payout_amount: u64,       // 0 for eval, 8% for funded pass
    pub passed: bool,
    pub result_hash: [u8; 32],
    pub completed_at: i64,
    pub bump: u8,
}

/// Per-payout request.  PDA seeds: [b"payout", trader_wallet, phase_byte].
#[account]
#[derive(InitSpace)]
pub struct PayoutRequest {
    pub trader: Pubkey,
    pub phase: Phase,
    pub amount: u64,        // always account_size * 800 / 10000
    pub amount_paid: u64,
    pub token_mint: Pubkey,
    pub status: PayoutStatus,
    pub queued_at: i64,
    pub completed_at: i64,  // 0 until fully paid
    pub bump: u8,
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

#[program]
pub mod setl8_vault {
    use super::*;

    // ===== 1. INITIALIZE =====
    pub fn initialize(
        ctx: Context<Initialize>,
        protocol_wallet: Pubkey,
        supported_mints: Vec<Pubkey>,
        fee_split_protocol_bps: u16,
        trader_reserve_bps: u16,
    ) -> Result<()> {
        require!(supported_mints.len() <= 5, ErrorCode::TooManyMints);
        require!(!supported_mints.is_empty(), ErrorCode::InvalidAmount);
        require!(fee_split_protocol_bps <= 10_000, ErrorCode::InvalidAmount);
        require!(trader_reserve_bps <= 10_000, ErrorCode::InvalidAmount);

        let vault_state = &mut ctx.accounts.vault_state;
        vault_state.admin = ctx.accounts.admin.key();
        vault_state.protocol_wallet = protocol_wallet;

        // Derive payout vault PDA
        let (payout_vault_pda, payout_vault_bump) = Pubkey::find_program_address(
            &[b"payout_vault", vault_state.key().as_ref()],
            ctx.program_id,
        );
        vault_state.payout_vault = payout_vault_pda;
        vault_state.payout_vault_bump = payout_vault_bump;

        vault_state.usdc_mint = supported_mints[0];
        vault_state.supported_mints = supported_mints.clone();
        vault_state.paused = false;

        vault_state.total_deposited = 0;
        vault_state.total_paid_out = 0;
        vault_state.admin_total_withdrawn = 0;
        vault_state.trader_count = 0;

        vault_state.fee_split_protocol_bps = fee_split_protocol_bps;
        vault_state.trader_reserve_bps = trader_reserve_bps;

        vault_state.last_heartbeat_at = Clock::get()?.unix_timestamp;
        vault_state.heartbeat_open = false;
        vault_state.heartbeat_ratio_bps = 0;
        vault_state.total_queued_payout_amount = 0;

        vault_state.emergency_withdraw_requested_at = 0;
        vault_state.bump = ctx.bumps.vault_state;

        emit!(VaultInitialized {
            admin: vault_state.admin,
            protocol_wallet: vault_state.protocol_wallet,
            payout_vault: vault_state.payout_vault,
            supported_mints,
        });

        Ok(())
    }

    // ===== 2. DEPOSIT EVALUATION FEE =====
    pub fn deposit_evaluation_fee(
        ctx: Context<DepositEvaluationFee>,
        amount: u64,
        account_size: u64,
    ) -> Result<()> {
        let vault_state = &mut ctx.accounts.vault_state;
        require!(!vault_state.paused, ErrorCode::ProtocolPaused);
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(account_size > 0, ErrorCode::InvalidAmount);

        let mint_key = ctx.accounts.token_mint.key();
        require!(
            vault_state.supported_mints.contains(&mint_key),
            ErrorCode::UnsupportedToken
        );

        // Calculate split
        let protocol_amount = amount
            .checked_mul(vault_state.fee_split_protocol_bps as u64)
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .checked_div(10_000)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        let vault_amount = amount
            .checked_sub(protocol_amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        // Transfer protocol share
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.trader_token_account.to_account_info(),
                    to: ctx.accounts.protocol_token_account.to_account_info(),
                    authority: ctx.accounts.trader.to_account_info(),
                },
            ),
            protocol_amount,
        )?;

        // Transfer vault share to PDA vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.trader_token_account.to_account_info(),
                    to: ctx.accounts.payout_vault_token_account.to_account_info(),
                    authority: ctx.accounts.trader.to_account_info(),
                },
            ),
            vault_amount,
        )?;

        // Update or create TraderAccount
        let trader_account = &mut ctx.accounts.trader_account;
        if trader_account.wallet == Pubkey::default() {
            // New trader
            trader_account.wallet = ctx.accounts.trader.key();
            trader_account.current_phase = Phase::Evaluation;
            trader_account.status = TraderStatus::Active;
            trader_account.account_size = account_size;
            trader_account.total_deposited = amount;
            trader_account.total_paid_out = 0;
            trader_account.phases_passed = 0;
            trader_account.phases_failed = 0;
            trader_account.created_at = Clock::get()?.unix_timestamp;
            trader_account.bump = ctx.bumps.trader_account;
            vault_state.trader_count = vault_state
                .trader_count
                .checked_add(1)
                .ok_or(ErrorCode::ArithmeticOverflow)?;
        } else {
            // Existing trader — can only rebuy after failing
            require!(
                trader_account.status == TraderStatus::Failed,
                ErrorCode::TraderAlreadyActive
            );
            trader_account.current_phase = Phase::Evaluation;
            trader_account.status = TraderStatus::Active;
            trader_account.account_size = account_size;
            trader_account.total_deposited = trader_account
                .total_deposited
                .checked_add(amount)
                .ok_or(ErrorCode::ArithmeticOverflow)?;
        }

        vault_state.total_deposited = vault_state
            .total_deposited
            .checked_add(amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        emit!(FeeDeposited {
            trader: ctx.accounts.trader.key(),
            amount,
            protocol_amount,
            vault_amount,
            token_mint: mint_key,
            account_size,
        });

        Ok(())
    }

    // ===== 3. SUBMIT RESULT — NO PAYOUT =====
    // Used for: eval pass, eval fail, funded fail
    pub fn submit_result_no_payout(
        ctx: Context<SubmitResultNoPayout>,
        passed: bool,
        starting_balance: u64,
        ending_balance: u64,
        realized_pnl: i64,
        total_trades: u32,
        winning_trades: u32,
        max_drawdown_used_bps: u16,
        drawdown_mode_at_end: u8,
        peak_balance: u64,
        result_hash: [u8; 32],
    ) -> Result<()> {
        let trader = &mut ctx.accounts.trader_account;
        require!(trader.status == TraderStatus::Active, ErrorCode::TraderNotActive);

        let now = Clock::get()?.unix_timestamp;

        // Populate PhaseResult
        let pr = &mut ctx.accounts.phase_result;
        pr.trader = trader.wallet;
        pr.phase = trader.current_phase;
        pr.account_size = trader.account_size;
        pr.starting_balance = starting_balance;
        pr.ending_balance = ending_balance;
        pr.realized_pnl = realized_pnl;
        pr.total_trades = total_trades;
        pr.winning_trades = winning_trades;
        pr.max_drawdown_used_bps = max_drawdown_used_bps;
        pr.drawdown_mode_at_end = drawdown_mode_at_end;
        pr.peak_balance = peak_balance;
        pr.result_hash = result_hash;
        pr.completed_at = now;
        pr.passed = passed;
        pr.payout_amount = 0;
        pr.bump = ctx.bumps.phase_result;

        if passed {
            trader.phases_passed += 1;
            // Must be evaluation phase if calling no_payout variant with passed=true
            require!(
                trader.current_phase == Phase::Evaluation,
                ErrorCode::InvalidInstruction
            );
            trader.current_phase = Phase::Funded1;
            trader.status = TraderStatus::Active;
        } else {
            trader.phases_failed += 1;
            trader.status = TraderStatus::Failed;
        }

        emit!(PhaseCompleted {
            trader: trader.wallet,
            phase: pr.phase,
            passed,
            payout_amount: 0,
            result_hash,
        });

        Ok(())
    }

    // ===== 4. SUBMIT RESULT — WITH PAYOUT =====
    // Used for: funded pass ONLY (auto-queues payout at 8%)
    pub fn submit_result_with_payout(
        ctx: Context<SubmitResultWithPayout>,
        starting_balance: u64,
        ending_balance: u64,
        realized_pnl: i64,
        total_trades: u32,
        winning_trades: u32,
        max_drawdown_used_bps: u16,
        drawdown_mode_at_end: u8,
        peak_balance: u64,
        result_hash: [u8; 32],
    ) -> Result<()> {
        let trader = &mut ctx.accounts.trader_account;
        let vault = &mut ctx.accounts.vault_state;
        require!(trader.status == TraderStatus::Active, ErrorCode::TraderNotActive);
        require!(trader.current_phase.is_funded(), ErrorCode::InvalidInstruction);

        let now = Clock::get()?.unix_timestamp;

        let payout_amount = trader
            .account_size
            .checked_mul(PAYOUT_BPS as u64)
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .checked_div(10_000)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        // Populate PhaseResult
        let pr = &mut ctx.accounts.phase_result;
        pr.trader = trader.wallet;
        pr.phase = trader.current_phase;
        pr.account_size = trader.account_size;
        pr.starting_balance = starting_balance;
        pr.ending_balance = ending_balance;
        pr.realized_pnl = realized_pnl;
        pr.total_trades = total_trades;
        pr.winning_trades = winning_trades;
        pr.max_drawdown_used_bps = max_drawdown_used_bps;
        pr.drawdown_mode_at_end = drawdown_mode_at_end;
        pr.peak_balance = peak_balance;
        pr.result_hash = result_hash;
        pr.completed_at = now;
        pr.passed = true;
        pr.payout_amount = payout_amount;
        pr.bump = ctx.bumps.phase_result;

        // Create PayoutRequest
        let pq = &mut ctx.accounts.payout_request;
        pq.trader = trader.wallet;
        pq.phase = trader.current_phase;
        pq.amount = payout_amount;
        pq.amount_paid = 0;
        pq.token_mint = vault.usdc_mint;
        pq.status = PayoutStatus::Queued;
        pq.queued_at = now;
        pq.completed_at = 0;
        pq.bump = ctx.bumps.payout_request;

        // Update vault queued amount
        vault.total_queued_payout_amount = vault
            .total_queued_payout_amount
            .checked_add(payout_amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        // Advance trader
        trader.phases_passed += 1;
        let completed_phase = trader.current_phase;
        match trader.current_phase.next() {
            Some(next_phase) => {
                trader.current_phase = next_phase;
                trader.status = TraderStatus::Active;
            }
            None => {
                // Funded5 was the last — graduate
                trader.status = TraderStatus::Graduated;
            }
        }

        emit!(PhaseCompleted {
            trader: trader.wallet,
            phase: completed_phase,
            passed: true,
            payout_amount,
            result_hash,
        });
        emit!(PayoutQueued {
            trader: trader.wallet,
            phase: completed_phase,
            amount: payout_amount,
        });
        if trader.status == TraderStatus::Graduated {
            emit!(TraderGraduated {
                trader: trader.wallet,
                total_phases: trader.phases_passed,
                total_paid_out: trader.total_paid_out,
            });
        }

        Ok(())
    }

    // ===== 5. PROCESS HEARTBEAT OPEN (PERMISSIONLESS) =====
    pub fn process_heartbeat_open(ctx: Context<ProcessHeartbeatOpen>) -> Result<()> {
        let vault = &mut ctx.accounts.vault_state;
        let now = Clock::get()?.unix_timestamp;

        require!(!vault.heartbeat_open, ErrorCode::HeartbeatAlreadyOpen);
        require!(
            now >= vault
                .last_heartbeat_at
                .checked_add(HEARTBEAT_INTERVAL)
                .ok_or(ErrorCode::ArithmeticOverflow)?,
            ErrorCode::HeartbeatTooEarly
        );

        let available = ctx.accounts.payout_vault_token_account.amount;

        let total_queued = vault.total_queued_payout_amount;

        vault.last_heartbeat_at = now;

        if total_queued == 0 {
            // No payouts needed — just update timestamp
            emit!(HeartbeatOpened {
                timestamp: now,
                ratio_bps: 0,
                total_queued: 0,
                vault_available: available,
            });
            return Ok(());
        }

        let ratio_bps: u16 = if available >= total_queued {
            10_000
        } else {
            // Pro-rata: (available * 10000 / total_queued)
            let ratio = available
                .checked_mul(10_000)
                .ok_or(ErrorCode::ArithmeticOverflow)?
                .checked_div(total_queued)
                .ok_or(ErrorCode::ArithmeticOverflow)?;
            ratio as u16
        };

        vault.heartbeat_open = true;
        vault.heartbeat_ratio_bps = ratio_bps;

        emit!(HeartbeatOpened {
            timestamp: now,
            ratio_bps,
            total_queued,
            vault_available: available,
        });

        Ok(())
    }

    // ===== 6. PROCESS PAYOUT (PERMISSIONLESS) =====
    pub fn process_payout(ctx: Context<ProcessPayout>) -> Result<()> {
        // Copy values before mutable borrow
        let vault_state_key = ctx.accounts.vault_state.key();
        let payout_vault_bump = ctx.accounts.vault_state.payout_vault_bump;
        let heartbeat_open = ctx.accounts.vault_state.heartbeat_open;
        let heartbeat_ratio_bps = ctx.accounts.vault_state.heartbeat_ratio_bps;

        require!(heartbeat_open, ErrorCode::HeartbeatNotOpen);

        let payout = &mut ctx.accounts.payout_request;
        require!(
            payout.status == PayoutStatus::Queued
                || payout.status == PayoutStatus::PartiallyPaid,
            ErrorCode::PayoutNotQueued
        );

        let remaining = payout
            .amount
            .checked_sub(payout.amount_paid)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        let this_payment = remaining
            .checked_mul(heartbeat_ratio_bps as u64)
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .checked_div(10_000)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        if this_payment == 0 {
            return Ok(()); // skip zero payments
        }

        // Transfer from PDA vault to trader
        let seeds: &[&[u8]] = &[
            b"payout_vault",
            vault_state_key.as_ref(),
            &[payout_vault_bump],
        ];
        let signer_seeds = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.payout_vault_token_account.to_account_info(),
                    to: ctx.accounts.trader_token_account.to_account_info(),
                    authority: ctx.accounts.payout_vault.to_account_info(),
                },
                signer_seeds,
            ),
            this_payment,
        )?;

        // Update payout request
        payout.amount_paid = payout
            .amount_paid
            .checked_add(this_payment)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        if payout.amount_paid >= payout.amount {
            payout.status = PayoutStatus::Completed;
            payout.completed_at = Clock::get()?.unix_timestamp;
        } else {
            payout.status = PayoutStatus::PartiallyPaid;
        }

        // Update vault state
        let vault = &mut ctx.accounts.vault_state;
        vault.total_queued_payout_amount = vault
            .total_queued_payout_amount
            .saturating_sub(this_payment);
        vault.total_paid_out = vault
            .total_paid_out
            .checked_add(this_payment)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        // Update trader account
        let trader = &mut ctx.accounts.trader_account;
        trader.total_paid_out = trader
            .total_paid_out
            .checked_add(this_payment)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        let remaining_after = payout.amount.saturating_sub(payout.amount_paid);

        emit!(PayoutProcessed {
            trader: payout.trader,
            amount_paid: this_payment,
            total_paid: payout.amount_paid,
            remaining: remaining_after,
            phase: payout.phase,
        });

        Ok(())
    }

    // ===== 7. PROCESS HEARTBEAT CLOSE (PERMISSIONLESS) =====
    pub fn process_heartbeat_close(ctx: Context<ProcessHeartbeatClose>) -> Result<()> {
        let vault = &mut ctx.accounts.vault_state;
        require!(vault.heartbeat_open, ErrorCode::HeartbeatNotOpen);

        vault.heartbeat_open = false;
        vault.heartbeat_ratio_bps = 0;

        emit!(HeartbeatClosed {
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // ===== 8. ADMIN WITHDRAW =====
    pub fn admin_withdraw(ctx: Context<AdminWithdraw>, amount: u64) -> Result<()> {
        // Copy values before mutable borrow
        let vault_state_key = ctx.accounts.vault_state.key();
        let payout_vault_bump = ctx.accounts.vault_state.payout_vault_bump;

        let vault = &mut ctx.accounts.vault_state;
        require!(!vault.paused, ErrorCode::ProtocolPaused);
        require!(amount > 0, ErrorCode::InvalidAmount);

        let vault_balance = ctx.accounts.payout_vault_token_account.amount;
        let reserve = vault_balance
            .checked_mul(vault.trader_reserve_bps as u64)
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .checked_div(10_000)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        let locked = std::cmp::max(reserve, vault.total_queued_payout_amount);
        let available = vault_balance.saturating_sub(locked);
        require!(amount <= available, ErrorCode::ExceedsWithdrawable);

        // Transfer from PDA vault to admin
        let seeds: &[&[u8]] = &[
            b"payout_vault",
            vault_state_key.as_ref(),
            &[payout_vault_bump],
        ];
        let signer_seeds = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.payout_vault_token_account.to_account_info(),
                    to: ctx.accounts.admin_token_account.to_account_info(),
                    authority: ctx.accounts.payout_vault.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        vault.admin_total_withdrawn = vault
            .admin_total_withdrawn
            .checked_add(amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        let vault_remaining = ctx
            .accounts
            .payout_vault_token_account
            .amount
            .saturating_sub(amount);

        emit!(AdminWithdrawal {
            admin: ctx.accounts.admin.key(),
            amount,
            vault_remaining,
        });

        Ok(())
    }

    // ===== 9. ADMIN DEPOSIT =====
    pub fn admin_deposit(ctx: Context<AdminDeposit>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.admin_token_account.to_account_info(),
                    to: ctx.accounts.payout_vault_token_account.to_account_info(),
                    authority: ctx.accounts.admin.to_account_info(),
                },
            ),
            amount,
        )?;

        emit!(AdminDepositEvent {
            admin: ctx.accounts.admin.key(),
            amount,
        });

        Ok(())
    }

    // ===== 10. REQUEST EMERGENCY WITHDRAW =====
    pub fn request_emergency_withdraw(ctx: Context<EmergencyRequest>) -> Result<()> {
        let vault = &mut ctx.accounts.vault_state;
        let now = Clock::get()?.unix_timestamp;
        vault.emergency_withdraw_requested_at = now;

        emit!(EmergencyWithdrawRequested {
            admin: ctx.accounts.admin.key(),
            requested_at: now,
            executable_at: now
                .checked_add(EMERGENCY_TIMELOCK)
                .ok_or(ErrorCode::ArithmeticOverflow)?,
        });

        Ok(())
    }

    // ===== 11. EXECUTE EMERGENCY WITHDRAW =====
    pub fn execute_emergency_withdraw(ctx: Context<EmergencyExecute>) -> Result<()> {
        // Copy values before mutable borrow
        let vault_state_key = ctx.accounts.vault_state.key();
        let payout_vault_bump = ctx.accounts.vault_state.payout_vault_bump;
        let emergency_requested_at = ctx.accounts.vault_state.emergency_withdraw_requested_at;

        let vault = &mut ctx.accounts.vault_state;
        let now = Clock::get()?.unix_timestamp;

        require!(
            emergency_requested_at > 0,
            ErrorCode::NoEmergencyRequested
        );
        require!(
            now >= emergency_requested_at
                .checked_add(EMERGENCY_TIMELOCK)
                .ok_or(ErrorCode::ArithmeticOverflow)?,
            ErrorCode::TimelockNotExpired
        );

        let balance = ctx.accounts.payout_vault_token_account.amount;

        if balance > 0 {
            let seeds: &[&[u8]] = &[
                b"payout_vault",
                vault_state_key.as_ref(),
                &[payout_vault_bump],
            ];
            let signer_seeds = &[seeds];

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.payout_vault_token_account.to_account_info(),
                        to: ctx.accounts.admin_token_account.to_account_info(),
                        authority: ctx.accounts.payout_vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                balance,
            )?;
        }

        vault.paused = true;
        vault.emergency_withdraw_requested_at = 0;
        vault.admin_total_withdrawn = vault
            .admin_total_withdrawn
            .checked_add(balance)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        emit!(EmergencyWithdrawal {
            admin: ctx.accounts.admin.key(),
            amount: balance,
        });

        Ok(())
    }

    // ===== 12. CANCEL EMERGENCY WITHDRAW =====
    pub fn cancel_emergency_withdraw(ctx: Context<EmergencyCancel>) -> Result<()> {
        let vault = &mut ctx.accounts.vault_state;
        vault.emergency_withdraw_requested_at = 0;
        Ok(())
    }

    // ===== 13. UNPAUSE =====
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        let vault = &mut ctx.accounts.vault_state;
        vault.paused = false;
        Ok(())
    }

    // ===== 14. UPDATE CONFIG =====
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        fee_split_protocol_bps: Option<u16>,
        trader_reserve_bps: Option<u16>,
        supported_mints: Option<Vec<Pubkey>>,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault_state;

        if let Some(bps) = fee_split_protocol_bps {
            require!(bps <= 10_000, ErrorCode::InvalidAmount);
            vault.fee_split_protocol_bps = bps;
        }
        if let Some(bps) = trader_reserve_bps {
            require!(bps <= 10_000, ErrorCode::InvalidAmount);
            vault.trader_reserve_bps = bps;
        }
        if let Some(mints) = supported_mints {
            require!(mints.len() <= 5, ErrorCode::TooManyMints);
            vault.supported_mints = mints;
        }

        Ok(())
    }

    // ===== 15. FORCE CLOSE VAULT STATE (devnet migration only) =====
    pub fn force_close_vault_state(ctx: Context<ForceCloseVaultState>) -> Result<()> {
        let vault_info = ctx.accounts.vault_state.to_account_info();
        let admin_info = ctx.accounts.admin.to_account_info();

        let data = vault_info.try_borrow_data()?;
        require!(data.len() >= 40, ErrorCode::InvalidAmount);
        let stored_admin =
            Pubkey::try_from(&data[8..40]).map_err(|_| ErrorCode::Unauthorized)?;
        require_keys_eq!(admin_info.key(), stored_admin, ErrorCode::Unauthorized);
        drop(data);

        let vault_lamports = vault_info.lamports();
        **vault_info.try_borrow_mut_lamports()? = 0;
        **admin_info.try_borrow_mut_lamports()? = admin_info
            .lamports()
            .checked_add(vault_lamports)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        let mut data = vault_info.try_borrow_mut_data()?;
        data.fill(0);

        Ok(())
    }

    // ===== 16. FORCE CLOSE TRADER ACCOUNT (devnet helper only) =====
    // Uses raw AccountInfo to avoid deserializing a potentially stale layout.
    // Admin is verified via the (still-current) VaultState. The PDA seeds
    // constraint on the account context guarantees the passed account is
    // derived from the provided `trader` pubkey.
    pub fn force_close_trader_account(
        ctx: Context<ForceCloseTraderAccount>,
        _trader: Pubkey,
    ) -> Result<()> {
        let trader_info = ctx.accounts.trader_account.to_account_info();
        let admin_info = ctx.accounts.admin.to_account_info();

        let trader_lamports = trader_info.lamports();
        **trader_info.try_borrow_mut_lamports()? = 0;
        **admin_info.try_borrow_mut_lamports()? = admin_info
            .lamports()
            .checked_add(trader_lamports)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        let mut data = trader_info.try_borrow_mut_data()?;
        data.fill(0);

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Account Contexts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + VaultState::INIT_SPACE,
        seeds = [b"vault_state"],
        bump,
    )]
    pub vault_state: Account<'info, VaultState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositEvaluationFee<'info> {
    #[account(mut, seeds = [b"vault_state"], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,
    #[account(
        init_if_needed,
        payer = trader,
        space = 8 + TraderAccount::INIT_SPACE,
        seeds = [b"trader", trader.key().as_ref()],
        bump,
    )]
    pub trader_account: Account<'info, TraderAccount>,
    #[account(mut)]
    pub trader: Signer<'info>,
    #[account(mut, token::mint = token_mint, token::authority = trader)]
    pub trader_token_account: Account<'info, TokenAccount>,
    #[account(mut, token::mint = token_mint)]
    pub protocol_token_account: Account<'info, TokenAccount>,
    #[account(mut, token::mint = token_mint)]
    pub payout_vault_token_account: Account<'info, TokenAccount>,
    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitResultNoPayout<'info> {
    #[account(seeds = [b"vault_state"], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,
    #[account(
        mut,
        seeds = [b"trader", trader_account.wallet.as_ref()],
        bump = trader_account.bump,
    )]
    pub trader_account: Account<'info, TraderAccount>,
    #[account(
        init,
        payer = admin,
        space = 8 + PhaseResult::INIT_SPACE,
        seeds = [b"phase_result", trader_account.wallet.as_ref(), &[trader_account.current_phase.number()]],
        bump,
    )]
    pub phase_result: Account<'info, PhaseResult>,
    #[account(
        mut,
        constraint = admin.key() == vault_state.admin @ ErrorCode::Unauthorized,
    )]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitResultWithPayout<'info> {
    #[account(mut, seeds = [b"vault_state"], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,
    #[account(
        mut,
        seeds = [b"trader", trader_account.wallet.as_ref()],
        bump = trader_account.bump,
    )]
    pub trader_account: Account<'info, TraderAccount>,
    #[account(
        init,
        payer = admin,
        space = 8 + PhaseResult::INIT_SPACE,
        seeds = [b"phase_result", trader_account.wallet.as_ref(), &[trader_account.current_phase.number()]],
        bump,
    )]
    pub phase_result: Account<'info, PhaseResult>,
    #[account(
        init,
        payer = admin,
        space = 8 + PayoutRequest::INIT_SPACE,
        seeds = [b"payout", trader_account.wallet.as_ref(), &[trader_account.current_phase.number()]],
        bump,
    )]
    pub payout_request: Account<'info, PayoutRequest>,
    #[account(
        mut,
        constraint = admin.key() == vault_state.admin @ ErrorCode::Unauthorized,
    )]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ProcessHeartbeatOpen<'info> {
    #[account(mut, seeds = [b"vault_state"], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,
    #[account(token::mint = vault_state.usdc_mint)]
    pub payout_vault_token_account: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct ProcessPayout<'info> {
    #[account(mut, seeds = [b"vault_state"], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,
    #[account(
        mut,
        constraint = payout_request.trader == trader_account.wallet,
    )]
    pub payout_request: Account<'info, PayoutRequest>,
    #[account(
        mut,
        seeds = [b"trader", trader_account.wallet.as_ref()],
        bump = trader_account.bump,
    )]
    pub trader_account: Account<'info, TraderAccount>,
    /// CHECK: PDA vault authority — program signs via invoke_signed
    #[account(
        seeds = [b"payout_vault", vault_state.key().as_ref()],
        bump = vault_state.payout_vault_bump,
    )]
    pub payout_vault: AccountInfo<'info>,
    #[account(mut, token::mint = vault_state.usdc_mint)]
    pub payout_vault_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = vault_state.usdc_mint,
        token::authority = trader_account.wallet,
    )]
    pub trader_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ProcessHeartbeatClose<'info> {
    #[account(mut, seeds = [b"vault_state"], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,
}

#[derive(Accounts)]
pub struct AdminWithdraw<'info> {
    #[account(mut, seeds = [b"vault_state"], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,
    #[account(constraint = admin.key() == vault_state.admin @ ErrorCode::Unauthorized)]
    pub admin: Signer<'info>,
    /// CHECK: PDA vault
    #[account(
        seeds = [b"payout_vault", vault_state.key().as_ref()],
        bump = vault_state.payout_vault_bump,
    )]
    pub payout_vault: AccountInfo<'info>,
    #[account(mut, token::mint = vault_state.usdc_mint)]
    pub payout_vault_token_account: Account<'info, TokenAccount>,
    #[account(mut, token::mint = vault_state.usdc_mint)]
    pub admin_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AdminDeposit<'info> {
    #[account(seeds = [b"vault_state"], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,
    #[account(constraint = admin.key() == vault_state.admin @ ErrorCode::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(mut, token::mint = vault_state.usdc_mint)]
    pub admin_token_account: Account<'info, TokenAccount>,
    #[account(mut, token::mint = vault_state.usdc_mint)]
    pub payout_vault_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct EmergencyRequest<'info> {
    #[account(mut, seeds = [b"vault_state"], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,
    #[account(constraint = admin.key() == vault_state.admin @ ErrorCode::Unauthorized)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct EmergencyExecute<'info> {
    #[account(mut, seeds = [b"vault_state"], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,
    #[account(constraint = admin.key() == vault_state.admin @ ErrorCode::Unauthorized)]
    pub admin: Signer<'info>,
    /// CHECK: PDA vault
    #[account(
        seeds = [b"payout_vault", vault_state.key().as_ref()],
        bump = vault_state.payout_vault_bump,
    )]
    pub payout_vault: AccountInfo<'info>,
    #[account(mut, token::mint = vault_state.usdc_mint)]
    pub payout_vault_token_account: Account<'info, TokenAccount>,
    #[account(mut, token::mint = vault_state.usdc_mint)]
    pub admin_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct EmergencyCancel<'info> {
    #[account(mut, seeds = [b"vault_state"], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,
    #[account(constraint = admin.key() == vault_state.admin @ ErrorCode::Unauthorized)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct Unpause<'info> {
    #[account(mut, seeds = [b"vault_state"], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,
    #[account(constraint = admin.key() == vault_state.admin @ ErrorCode::Unauthorized)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, seeds = [b"vault_state"], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,
    #[account(constraint = admin.key() == vault_state.admin @ ErrorCode::Unauthorized)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct ForceCloseVaultState<'info> {
    /// CHECK: Intentionally unchecked — avoids deserialization of old layout.
    /// Admin is verified by reading raw bytes.
    #[account(mut, seeds = [b"vault_state"], bump)]
    pub vault_state: AccountInfo<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(trader: Pubkey)]
pub struct ForceCloseTraderAccount<'info> {
    #[account(seeds = [b"vault_state"], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,
    /// CHECK: Intentionally unchecked — avoids deserialization of old layout.
    /// Identity is enforced by the seeds constraint below (derived from the
    /// `trader` instruction argument + canonical bump).
    #[account(mut, seeds = [b"trader", trader.as_ref()], bump)]
    pub trader_account: AccountInfo<'info>,
    #[account(
        mut,
        constraint = admin.key() == vault_state.admin @ ErrorCode::Unauthorized,
    )]
    pub admin: Signer<'info>,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct VaultInitialized {
    pub admin: Pubkey,
    pub protocol_wallet: Pubkey,
    pub payout_vault: Pubkey,
    pub supported_mints: Vec<Pubkey>,
}

#[event]
pub struct FeeDeposited {
    pub trader: Pubkey,
    pub amount: u64,
    pub protocol_amount: u64,
    pub vault_amount: u64,
    pub token_mint: Pubkey,
    pub account_size: u64,
}

#[event]
pub struct PhaseCompleted {
    pub trader: Pubkey,
    pub phase: Phase,
    pub passed: bool,
    pub payout_amount: u64,
    pub result_hash: [u8; 32],
}

#[event]
pub struct PayoutQueued {
    pub trader: Pubkey,
    pub phase: Phase,
    pub amount: u64,
}

#[event]
pub struct HeartbeatOpened {
    pub timestamp: i64,
    pub ratio_bps: u16,
    pub total_queued: u64,
    pub vault_available: u64,
}

#[event]
pub struct PayoutProcessed {
    pub trader: Pubkey,
    pub amount_paid: u64,
    pub total_paid: u64,
    pub remaining: u64,
    pub phase: Phase,
}

#[event]
pub struct HeartbeatClosed {
    pub timestamp: i64,
}

#[event]
pub struct AdminWithdrawal {
    pub admin: Pubkey,
    pub amount: u64,
    pub vault_remaining: u64,
}

#[event]
pub struct AdminDepositEvent {
    pub admin: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EmergencyWithdrawRequested {
    pub admin: Pubkey,
    pub requested_at: i64,
    pub executable_at: i64,
}

#[event]
pub struct EmergencyWithdrawal {
    pub admin: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TraderGraduated {
    pub trader: Pubkey,
    pub total_phases: u8,
    pub total_paid_out: u64,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[error_code]
pub enum ErrorCode {
    #[msg("Caller is not the vault admin")]
    Unauthorized,
    #[msg("Token mint is not supported")]
    UnsupportedToken,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Too many mints (max 5)")]
    TooManyMints,
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Trader is not in Active status")]
    TraderNotActive,
    #[msg("Trader is already active")]
    TraderAlreadyActive,
    #[msg("Trader has graduated")]
    TraderGraduated,
    #[msg("Wrong instruction variant for this phase")]
    InvalidInstruction,
    #[msg("Heartbeat interval not reached (5 days)")]
    HeartbeatTooEarly,
    #[msg("Heartbeat window is not open")]
    HeartbeatNotOpen,
    #[msg("Heartbeat window is already open")]
    HeartbeatAlreadyOpen,
    #[msg("Payout is not in queued status")]
    PayoutNotQueued,
    #[msg("Insufficient vault balance")]
    InsufficientVaultBalance,
    #[msg("Withdrawal exceeds available balance")]
    ExceedsWithdrawable,
    #[msg("No emergency withdraw has been requested")]
    NoEmergencyRequested,
    #[msg("48-hour timelock has not expired")]
    TimelockNotExpired,
}
