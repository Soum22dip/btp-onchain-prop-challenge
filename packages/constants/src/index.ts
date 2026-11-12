// =============================================================================
// SETL8 — Shared Constants
// =============================================================================

import {
  EvaluationPackage,
  Market,
  Network,
  TokenInfo,
  TokenSymbol,
} from '@setl8/types';

// ---------------------------------------------------------------------------
// Trading Rules
// ---------------------------------------------------------------------------

/**
 * @deprecated Use MAX_LEVERAGE[market] instead — per-asset leverage limits.
 * Kept for backward compat; new code should use MAX_LEVERAGE map.
 */
export const LEVERAGE = 50;

/** Profit target required to pass an attempt (8%) */
export const PROFIT_TARGET_PERCENT = 0.08;

/** Maximum allowable drawdown from starting balance before failing (8%) */
export const MAX_DRAWDOWN_PERCENT = 0.08;

/** Trailing drawdown percent (4% from peak, active after winning trades) */
export const TRAILING_DRAWDOWN_PERCENT = 0.04;

/** Loss threshold to reset from trailing back to static (1% of starting balance) */
export const DD_RESET_THRESHOLD_PERCENT = 0.01;

/** Total number of phases a trader can take (1 eval + 5 funded) */
export const TOTAL_ATTEMPTS = 6;

/** Number of evaluation phases before funded */
export const EVALUATION_PHASES = 1;

/** Number of funded phases */
export const FUNDED_PHASES = 5;

/** Attempt numbers that are evaluation-only (no payout eligible) */
export const EVALUATION_ONLY_ATTEMPTS = [1] as const;

/** First attempt number that qualifies for payouts */
export const FIRST_FUNDED_ATTEMPT = 2;

/** Minimum payout as a fraction of account size (8%) */
export const MIN_PAYOUT_PERCENT = 0.08;

/** Maximum cumulative payout across all funded attempts (40%) */
export const MAX_CUMULATIVE_PAYOUT_PERCENT = 0.40;

/** No daily drawdown stopout — only overall max drawdown applies */
export const DAILY_STOPOUT_ENABLED = false;

// ---------------------------------------------------------------------------
// Fee Split
// ---------------------------------------------------------------------------

/** Fraction of evaluation fee sent to protocol/admin wallet (35%) */
export const PROTOCOL_FEE_SPLIT = 0.35;

/** Fraction of evaluation fee sent to PDA payout vault (65%) */
export const PAYOUT_VAULT_SPLIT = 0.65;

/** Fee split in basis points — protocol/admin (3500 = 35%) */
export const FEE_SPLIT_PROTOCOL_BPS = 3500;

/** Fee split in basis points — vault (6500 = 65%) */
export const FEE_SPLIT_VAULT_BPS = 6500;

/** Trader reserve — 25% of vault balance is locked for trader payouts */
export const TRADER_RESERVE_BPS = 2500;

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

/** Payout batch runs every 5 days (heartbeat interval) */
export const PAYOUT_BATCH_INTERVAL_DAYS = 5;

/** Heartbeat interval in hours (5 days = 120 hours) */
export const HEARTBEAT_INTERVAL_HOURS = 120;

/** P&L snapshots taken every 8 hours (in milliseconds) */
export const SNAPSHOT_INTERVAL_MS = 8 * 60 * 60 * 1000;

/** Snapshot timezone offset for SGT (UTC+8) in minutes */
export const SNAPSHOT_TIMEZONE_OFFSET_MINUTES = 480;

/** Snapshot hours in SGT (00:00, 08:00, 16:00) */
export const SNAPSHOT_HOURS_SGT = [0, 8, 16] as const;

// ---------------------------------------------------------------------------
// Evaluation Packages
// ---------------------------------------------------------------------------

/** All available evaluation packages. Price is in USD cents. */
export const EVALUATION_PACKAGES: EvaluationPackage[] = [
  { priceCents:  3000, accountSize:   2_500 },
  { priceCents:  5500, accountSize:   5_000 },
  { priceCents:  9900, accountSize:  10_000 },
  { priceCents: 14500, accountSize:  15_000 },
  { priceCents: 23500, accountSize:  25_000 },
  { priceCents: 42900, accountSize:  50_000 },
  { priceCents: 59900, accountSize:  75_000 },
  { priceCents:  74900, accountSize: 100_000 },
  { priceCents: 159900, accountSize: 200_000 },
];

/** Map of account size → evaluation package for quick lookup */
export const PACKAGE_BY_ACCOUNT_SIZE: Readonly<Record<number, EvaluationPackage>> =
  Object.fromEntries(EVALUATION_PACKAGES.map((p) => [p.accountSize, p]));

// ---------------------------------------------------------------------------
// Supported Tokens
// ---------------------------------------------------------------------------

export const TOKEN_INFO: Readonly<Record<TokenSymbol, TokenInfo>> = {
  [TokenSymbol.USDC]: {
    symbol: TokenSymbol.USDC,
    decimals: 6,
    devnetMint:  'BpkjNnKSRCsNJMAMKtLs1jJCZpcnEh8ZqmMdRZA8QKBC',
    mainnetMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  },
  [TokenSymbol.USDT]: {
    symbol: TokenSymbol.USDT,
    decimals: 6,
    devnetMint:  'BpkjNnKSRCsNJMAMKtLs1jJCZpcnEh8ZqmMdRZA8QKBC',
    mainnetMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  },
  [TokenSymbol.USD1]: {
    symbol: TokenSymbol.USD1,
    decimals: 6,
    devnetMint:  'BpkjNnKSRCsNJMAMKtLs1jJCZpcnEh8ZqmMdRZA8QKBC',
    mainnetMint: 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',
  },
};

/** Accepted token symbols for evaluation fee payment */
export const ACCEPTED_TOKENS: TokenSymbol[] = [
  TokenSymbol.USDT,
  TokenSymbol.USDC,
  TokenSymbol.USD1,
];

/**
 * Returns the mint address for a token on the given network.
 */
export function getTokenMint(symbol: TokenSymbol, network: Network): string {
  const info = TOKEN_INFO[symbol];
  return network === Network.Mainnet ? info.mainnetMint : info.devnetMint;
}

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

export const PROTOCOL_WALLET_ADDRESS = 'SL89fcsKAuWYtkEJah86WLLBxCiHd1DeNczpsDjSHDJ';

/** @deprecated Payout vault is now a PDA — derive with PAYOUT_VAULT_SEED */
export const PAYOUT_VAULT_ADDRESS    = 'BMHggqxZUgjMEwev5z8YDbFsd6LvTFdZu2SB7B4n7Z1e';

/** Deployed setl8-vault program ID (devnet + mainnet) */
export const VAULT_PROGRAM_ID = 'C3bvX2hkL76wXNobbyJPV5JpEPRFc3ksA4khR8WU9Rnk';

/** PDA seed for VaultState singleton */
export const VAULT_STATE_SEED = 'vault_state';

/** PDA seed for the payout vault (authority for vault token accounts) */
export const PAYOUT_VAULT_SEED = 'payout_vault';

/** PDA seed for trader accounts */
export const TRADER_ACCOUNT_SEED = 'trader';

/** PDA seed for phase result accounts */
export const PHASE_RESULT_SEED = 'phase_result';

/** PDA seed for payout request accounts */
export const PAYOUT_REQUEST_SEED = 'payout';

/** Instruction discriminator for deposit_evaluation_fee (sha256("global:deposit_evaluation_fee")[0..8]) */
export const DEPOSIT_FEE_DISCRIMINATOR = new Uint8Array([81, 200, 130, 179, 64, 155, 57, 58]);

// ---------------------------------------------------------------------------
// Market Category
// ---------------------------------------------------------------------------

export enum MarketCategory {
  CRYPTO  = 'CRYPTO',
  METALS  = 'METALS',
  INDICES = 'INDICES',
  FOREX   = 'FOREX',
}

// ---------------------------------------------------------------------------
// Market Category Map
// ---------------------------------------------------------------------------

export const MARKET_CATEGORY: Readonly<Record<Market, MarketCategory>> = {
  // Crypto (66)
  [Market.BTC]: MarketCategory.CRYPTO,    [Market.ETH]: MarketCategory.CRYPTO,
  [Market.SOL]: MarketCategory.CRYPTO,    [Market.BNB]: MarketCategory.CRYPTO,
  [Market.XRP]: MarketCategory.CRYPTO,    [Market.DOGE]: MarketCategory.CRYPTO,
  [Market.ADA]: MarketCategory.CRYPTO,    [Market.AVAX]: MarketCategory.CRYPTO,
  [Market.LINK]: MarketCategory.CRYPTO,   [Market.DOT]: MarketCategory.CRYPTO,
  [Market.LTC]: MarketCategory.CRYPTO,    [Market.BCH]: MarketCategory.CRYPTO,
  [Market.UNI]: MarketCategory.CRYPTO,    [Market.ATOM]: MarketCategory.CRYPTO,
  [Market.ETC]: MarketCategory.CRYPTO,    [Market.APT]: MarketCategory.CRYPTO,
  [Market.OP]: MarketCategory.CRYPTO,     [Market.ARB]: MarketCategory.CRYPTO,
  [Market.MATIC]: MarketCategory.CRYPTO,  [Market.SUI]: MarketCategory.CRYPTO,
  [Market.SEI]: MarketCategory.CRYPTO,    [Market.TIA]: MarketCategory.CRYPTO,
  [Market.INJ]: MarketCategory.CRYPTO,    [Market.FTM]: MarketCategory.CRYPTO,
  [Market.NEAR]: MarketCategory.CRYPTO,   [Market.PEPE]: MarketCategory.CRYPTO,
  [Market.WIF]: MarketCategory.CRYPTO,    [Market.JUP]: MarketCategory.CRYPTO,
  [Market.BONK]: MarketCategory.CRYPTO,   [Market.RAY]: MarketCategory.CRYPTO,
  [Market.RENDER]: MarketCategory.CRYPTO, [Market.FET]: MarketCategory.CRYPTO,
  [Market.GRT]: MarketCategory.CRYPTO,    [Market.SNX]: MarketCategory.CRYPTO,
  [Market.AAVE]: MarketCategory.CRYPTO,   [Market.MKR]: MarketCategory.CRYPTO,
  [Market.COMP]: MarketCategory.CRYPTO,   [Market.LDO]: MarketCategory.CRYPTO,
  [Market.STX]: MarketCategory.CRYPTO,    [Market.RUNE]: MarketCategory.CRYPTO,
  [Market.WLD]: MarketCategory.CRYPTO,    [Market.TAO]: MarketCategory.CRYPTO,
  [Market.JTO]: MarketCategory.CRYPTO,    [Market.PYTH]: MarketCategory.CRYPTO,
  [Market.ONDO]: MarketCategory.CRYPTO,   [Market.ENA]: MarketCategory.CRYPTO,
  [Market.EIGEN]: MarketCategory.CRYPTO,  [Market.NOT]: MarketCategory.CRYPTO,
  [Market.TURBO]: MarketCategory.CRYPTO,
  [Market.TRX]: MarketCategory.CRYPTO,    [Market.HYPE]: MarketCategory.CRYPTO,
  [Market.HBAR]: MarketCategory.CRYPTO,   [Market.ZEC]: MarketCategory.CRYPTO,
  [Market.SHIB]: MarketCategory.CRYPTO,   [Market.TON]: MarketCategory.CRYPTO,
  [Market.CRO]: MarketCategory.CRYPTO,    [Market.MNT]: MarketCategory.CRYPTO,
  [Market.ICP]: MarketCategory.CRYPTO,    [Market.POL]: MarketCategory.CRYPTO,
  [Market.KAS]: MarketCategory.CRYPTO,    [Market.QNT]: MarketCategory.CRYPTO,
  [Market.ALGO]: MarketCategory.CRYPTO,   [Market.TRUMP]: MarketCategory.CRYPTO,
  [Market.FIL]: MarketCategory.CRYPTO,    [Market.ZRO]: MarketCategory.CRYPTO,
  [Market.VET]: MarketCategory.CRYPTO,
  // Metals (2)
  [Market.XAU]: MarketCategory.METALS, [Market.XAG]: MarketCategory.METALS,
  // Indices (4)
  [Market.SPY]: MarketCategory.INDICES, [Market.QQQ]: MarketCategory.INDICES,
  [Market.DIA]: MarketCategory.INDICES, [Market.IWM]: MarketCategory.INDICES,
  // Forex (14)
  [Market.EUR_USD]: MarketCategory.FOREX, [Market.GBP_USD]: MarketCategory.FOREX,
  [Market.USD_JPY]: MarketCategory.FOREX, [Market.AUD_USD]: MarketCategory.FOREX,
  [Market.USD_CAD]: MarketCategory.FOREX, [Market.USD_CHF]: MarketCategory.FOREX,
  [Market.NZD_USD]: MarketCategory.FOREX, [Market.EUR_GBP]: MarketCategory.FOREX,
  [Market.EUR_JPY]: MarketCategory.FOREX, [Market.GBP_JPY]: MarketCategory.FOREX,
  [Market.EUR_CHF]: MarketCategory.FOREX, [Market.AUD_JPY]: MarketCategory.FOREX,
  [Market.USD_MXN]: MarketCategory.FOREX, [Market.USD_SGD]: MarketCategory.FOREX,
};

// ---------------------------------------------------------------------------
// Market Labels (full name)
// ---------------------------------------------------------------------------

export const MARKET_LABELS: Readonly<Record<Market, string>> = {
  // Crypto
  [Market.BTC]: 'Bitcoin',            [Market.ETH]: 'Ethereum',
  [Market.SOL]: 'Solana',             [Market.BNB]: 'BNB',
  [Market.XRP]: 'XRP',                [Market.DOGE]: 'Dogecoin',
  [Market.ADA]: 'Cardano',            [Market.AVAX]: 'Avalanche',
  [Market.LINK]: 'Chainlink',         [Market.DOT]: 'Polkadot',
  [Market.LTC]: 'Litecoin',           [Market.BCH]: 'Bitcoin Cash',
  [Market.UNI]: 'Uniswap',            [Market.ATOM]: 'Cosmos',
  [Market.ETC]: 'Ethereum Classic',   [Market.APT]: 'Aptos',
  [Market.OP]: 'Optimism',            [Market.ARB]: 'Arbitrum',
  [Market.MATIC]: 'Polygon',          [Market.SUI]: 'Sui',
  [Market.SEI]: 'Sei',                [Market.TIA]: 'Celestia',
  [Market.INJ]: 'Injective',          [Market.FTM]: 'Fantom',
  [Market.NEAR]: 'NEAR Protocol',     [Market.PEPE]: 'Pepe',
  [Market.WIF]: 'dogwifhat',          [Market.JUP]: 'Jupiter',
  [Market.BONK]: 'Bonk',              [Market.RAY]: 'Raydium',
  [Market.RENDER]: 'Render',          [Market.FET]: 'Fetch.ai',
  [Market.GRT]: 'The Graph',          [Market.SNX]: 'Synthetix',
  [Market.AAVE]: 'Aave',              [Market.MKR]: 'Maker',
  [Market.COMP]: 'Compound',          [Market.LDO]: 'Lido DAO',
  [Market.STX]: 'Stacks',             [Market.RUNE]: 'THORChain',
  [Market.WLD]: 'Worldcoin',          [Market.TAO]: 'Bittensor',
  [Market.JTO]: 'Jito',               [Market.PYTH]: 'Pyth Network',
  [Market.ONDO]: 'Ondo Finance',      [Market.ENA]: 'Ethena',
  [Market.EIGEN]: 'EigenLayer',       [Market.NOT]: 'Notcoin',
  [Market.TURBO]: 'Turbo',
  [Market.TRX]: 'TRON',               [Market.HYPE]: 'Hyperliquid',
  [Market.HBAR]: 'Hedera',            [Market.ZEC]: 'Zcash',
  [Market.SHIB]: 'Shiba Inu',         [Market.TON]: 'Toncoin',
  [Market.CRO]: 'Cronos',             [Market.MNT]: 'Mantle',
  [Market.ICP]: 'Internet Computer',  [Market.POL]: 'Polygon PoS',
  [Market.KAS]: 'Kaspa',              [Market.QNT]: 'Quant',
  [Market.ALGO]: 'Algorand',          [Market.TRUMP]: 'TRUMP',
  [Market.FIL]: 'Filecoin',           [Market.ZRO]: 'LayerZero',
  [Market.VET]: 'VeChain',
  // Metals
  [Market.XAU]: 'Gold',               [Market.XAG]: 'Silver',
  // Indices
  [Market.SPY]: 'S&P 500',            [Market.QQQ]: 'Nasdaq 100',
  [Market.DIA]: 'Dow Jones',          [Market.IWM]: 'Russell 2000',
  // Forex
  [Market.EUR_USD]: 'Euro / US Dollar',
  [Market.GBP_USD]: 'British Pound / US Dollar',
  [Market.USD_JPY]: 'US Dollar / Japanese Yen',
  [Market.AUD_USD]: 'Australian Dollar / US Dollar',
  [Market.USD_CAD]: 'US Dollar / Canadian Dollar',
  [Market.USD_CHF]: 'US Dollar / Swiss Franc',
  [Market.NZD_USD]: 'New Zealand Dollar / US Dollar',
  [Market.EUR_GBP]: 'Euro / British Pound',
  [Market.EUR_JPY]: 'Euro / Japanese Yen',
  [Market.GBP_JPY]: 'British Pound / Japanese Yen',
  [Market.EUR_CHF]: 'Euro / Swiss Franc',
  [Market.AUD_JPY]: 'Australian Dollar / Japanese Yen',
  [Market.USD_MXN]: 'US Dollar / Mexican Peso',
  [Market.USD_SGD]: 'US Dollar / Singapore Dollar',
};

// ---------------------------------------------------------------------------
// Market Display Name (ticker format for UI)
// ---------------------------------------------------------------------------

export const MARKET_DISPLAY_NAME: Readonly<Record<Market, string>> = {
  // Crypto (symbol/USD)
  [Market.BTC]: 'BTC/USD',     [Market.ETH]: 'ETH/USD',
  [Market.SOL]: 'SOL/USD',     [Market.BNB]: 'BNB/USD',
  [Market.XRP]: 'XRP/USD',     [Market.DOGE]: 'DOGE/USD',
  [Market.ADA]: 'ADA/USD',     [Market.AVAX]: 'AVAX/USD',
  [Market.LINK]: 'LINK/USD',   [Market.DOT]: 'DOT/USD',
  [Market.LTC]: 'LTC/USD',     [Market.BCH]: 'BCH/USD',
  [Market.UNI]: 'UNI/USD',     [Market.ATOM]: 'ATOM/USD',
  [Market.ETC]: 'ETC/USD',     [Market.APT]: 'APT/USD',
  [Market.OP]: 'OP/USD',       [Market.ARB]: 'ARB/USD',
  [Market.MATIC]: 'MATIC/USD', [Market.SUI]: 'SUI/USD',
  [Market.SEI]: 'SEI/USD',     [Market.TIA]: 'TIA/USD',
  [Market.INJ]: 'INJ/USD',     [Market.FTM]: 'FTM/USD',
  [Market.NEAR]: 'NEAR/USD',   [Market.PEPE]: 'PEPE/USD',
  [Market.WIF]: 'WIF/USD',     [Market.JUP]: 'JUP/USD',
  [Market.BONK]: 'BONK/USD',   [Market.RAY]: 'RAY/USD',
  [Market.RENDER]: 'RENDER/USD', [Market.FET]: 'FET/USD',
  [Market.GRT]: 'GRT/USD',     [Market.SNX]: 'SNX/USD',
  [Market.AAVE]: 'AAVE/USD',   [Market.MKR]: 'MKR/USD',
  [Market.COMP]: 'COMP/USD',   [Market.LDO]: 'LDO/USD',
  [Market.STX]: 'STX/USD',     [Market.RUNE]: 'RUNE/USD',
  [Market.WLD]: 'WLD/USD',     [Market.TAO]: 'TAO/USD',
  [Market.JTO]: 'JTO/USD',     [Market.PYTH]: 'PYTH/USD',
  [Market.ONDO]: 'ONDO/USD',   [Market.ENA]: 'ENA/USD',
  [Market.EIGEN]: 'EIGEN/USD', [Market.NOT]: 'NOT/USD',
  [Market.TURBO]: 'TURBO/USD',
  [Market.TRX]: 'TRX/USD',     [Market.HYPE]: 'HYPE/USD',
  [Market.HBAR]: 'HBAR/USD',   [Market.ZEC]: 'ZEC/USD',
  [Market.SHIB]: 'SHIB/USD',   [Market.TON]: 'TON/USD',
  [Market.CRO]: 'CRO/USD',     [Market.MNT]: 'MNT/USD',
  [Market.ICP]: 'ICP/USD',     [Market.POL]: 'POL/USD',
  [Market.KAS]: 'KAS/USD',     [Market.QNT]: 'QNT/USD',
  [Market.ALGO]: 'ALGO/USD',   [Market.TRUMP]: 'TRUMP/USD',
  [Market.FIL]: 'FIL/USD',     [Market.ZRO]: 'ZRO/USD',
  [Market.VET]: 'VET/USD',
  // Metals
  [Market.XAU]: 'XAU/USD',     [Market.XAG]: 'XAG/USD',
  // Indices
  [Market.SPY]: 'SPY',         [Market.QQQ]: 'QQQ',
  [Market.DIA]: 'DIA',         [Market.IWM]: 'IWM',
  // Forex (standard forex notation)
  [Market.EUR_USD]: 'EUR/USD', [Market.GBP_USD]: 'GBP/USD',
  [Market.USD_JPY]: 'USD/JPY', [Market.AUD_USD]: 'AUD/USD',
  [Market.USD_CAD]: 'USD/CAD', [Market.USD_CHF]: 'USD/CHF',
  [Market.NZD_USD]: 'NZD/USD', [Market.EUR_GBP]: 'EUR/GBP',
  [Market.EUR_JPY]: 'EUR/JPY', [Market.GBP_JPY]: 'GBP/JPY',
  [Market.EUR_CHF]: 'EUR/CHF', [Market.AUD_JPY]: 'AUD/JPY',
  [Market.USD_MXN]: 'USD/MXN', [Market.USD_SGD]: 'USD/SGD',
};

// ---------------------------------------------------------------------------
// Default max leverage per market
// ---------------------------------------------------------------------------

export const MAX_LEVERAGE: Readonly<Record<Market, number>> = {
  // Crypto — all 50x
  [Market.BTC]: 50,  [Market.ETH]: 50,
  [Market.BNB]: 50,  [Market.XRP]: 50,
  [Market.SOL]: 50,  [Market.DOGE]: 50,
  [Market.ADA]: 50,  [Market.AVAX]: 50,
  [Market.LINK]: 50, [Market.DOT]: 50,
  [Market.LTC]: 50,  [Market.BCH]: 50,
  [Market.UNI]: 50,  [Market.ATOM]: 50,
  [Market.ETC]: 50,
  [Market.APT]: 50,  [Market.OP]: 50,
  [Market.ARB]: 50,  [Market.INJ]: 50,
  [Market.SUI]: 50,  [Market.SEI]: 50,
  [Market.TIA]: 50,  [Market.NEAR]: 50,
  [Market.FTM]: 50,  [Market.MATIC]: 50,
  [Market.STX]: 50,  [Market.RENDER]: 50,
  [Market.MKR]: 50,  [Market.AAVE]: 50,
  [Market.SNX]: 50,  [Market.LDO]: 50,
  [Market.COMP]: 50, [Market.RUNE]: 50,
  [Market.WLD]: 50,  [Market.TAO]: 50,
  [Market.FET]: 50,  [Market.GRT]: 50,
  [Market.PEPE]: 50,  [Market.WIF]: 50,
  [Market.JUP]: 50,   [Market.BONK]: 50,
  [Market.RAY]: 50,   [Market.JTO]: 50,
  [Market.PYTH]: 50,  [Market.ONDO]: 50,
  [Market.ENA]: 50,   [Market.EIGEN]: 50,
  [Market.NOT]: 50,   [Market.TURBO]: 50,
  [Market.TRX]: 50,    [Market.HYPE]: 50,
  [Market.HBAR]: 50,   [Market.ZEC]: 50,
  [Market.SHIB]: 50,   [Market.TON]: 50,
  [Market.CRO]: 50,    [Market.MNT]: 50,
  [Market.ICP]: 50,    [Market.POL]: 50,
  [Market.KAS]: 50,    [Market.QNT]: 50,
  [Market.ALGO]: 50,   [Market.TRUMP]: 50,
  [Market.FIL]: 50,    [Market.ZRO]: 50,
  [Market.VET]: 50,
  // Metals — 100x
  [Market.XAU]: 100,   [Market.XAG]: 100,
  // Indices — 100x
  [Market.SPY]: 100,   [Market.QQQ]: 100,
  [Market.DIA]: 100,   [Market.IWM]: 100,
  // Forex — all 200x
  [Market.EUR_USD]: 200, [Market.GBP_USD]: 200,
  [Market.USD_JPY]: 200, [Market.AUD_USD]: 200,
  [Market.USD_CAD]: 200, [Market.USD_CHF]: 200,
  [Market.NZD_USD]: 200,
  [Market.EUR_GBP]: 200, [Market.EUR_JPY]: 200,
  [Market.GBP_JPY]: 200, [Market.EUR_CHF]: 200,
  [Market.AUD_JPY]: 200,
  [Market.USD_MXN]: 200, [Market.USD_SGD]: 200,
};

// ---------------------------------------------------------------------------
// Market group arrays
// ---------------------------------------------------------------------------

export const METALS_MARKETS: readonly Market[] = [
  Market.XAU, Market.XAG,
] as const;

export const INDICES_MARKETS: readonly Market[] = [
  Market.SPY, Market.QQQ, Market.DIA, Market.IWM,
] as const;

export const FOREX_MARKETS: readonly Market[] = [
  Market.EUR_USD, Market.GBP_USD, Market.USD_JPY, Market.AUD_USD,
  Market.USD_CAD, Market.USD_CHF, Market.NZD_USD, Market.EUR_GBP,
  Market.EUR_JPY, Market.GBP_JPY, Market.EUR_CHF, Market.AUD_JPY,
  Market.USD_MXN, Market.USD_SGD,
] as const;

/**
 * Non-crypto markets — show "Market Closed" on weekends
 * (metals + indices + forex)
 */
export const NON_CRYPTO_MARKETS: readonly Market[] = [
  ...METALS_MARKETS,
  ...INDICES_MARKETS,
  ...FOREX_MARKETS,
] as const;

/** Minimum position size in USD */
export const MIN_POSITION_SIZE_USD = 10;

/** Trading fee: 0.035% of max(account balance, position notional) per open AND close */
export const POSITION_FEE_RATE = 0.00035;

/** @deprecated — kept for backward compat, use POSITION_FEE_RATE instead */
export const POSITION_FEE: Readonly<Record<string, number>> = {};
/** @deprecated */
export const DEFAULT_POSITION_FEE = 3;

// ---------------------------------------------------------------------------
// Solana
// ---------------------------------------------------------------------------

export const SOLANA_RPC_DEVNET  = 'https://api.devnet.solana.com';
export const SOLANA_RPC_MAINNET = 'https://api.mainnet-beta.solana.com';

export const SOLANA_PROGRAMS = {
  TOKEN_PROGRAM:         'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  ASSOCIATED_TOKEN_PROG: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bRS',
  SYSTEM_PROGRAM:        '11111111111111111111111111111111',
} as const;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** JWT lifetime in seconds (7 days) */
export const JWT_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

/** Auth challenge nonce TTL in seconds (5 minutes) */
export const AUTH_NONCE_TTL_SECONDS = 5 * 60;

/** Auth challenge message prefix presented to user for signing */
export const AUTH_MESSAGE_PREFIX = 'Sign in to Setl8\nNonce: ';

// ---------------------------------------------------------------------------
// Redis Keys
// ---------------------------------------------------------------------------

export const REDIS_KEYS = {
  price:         (market: Market)     => `price:${market}`,
  prices:        ()                   => 'prices:all',
  nonce:         (wallet: string)     => `nonce:${wallet}`,
  session:       (traderId: string)   => `session:${traderId}`,
  openPositions: (attemptId: string)  => `positions:open:${attemptId}`,
  vaultBalance:  ()                   => 'vault:balance',
  nextPayout:    ()                   => 'vault:next-payout',
  vaultFireLast: ()                   => 'vault:fire:last',
} as const;

/** Default Redis TTL for price data (seconds) */
export const REDIS_PRICE_TTL_SECONDS = 10;

/** Default Redis TTL for vault balance cache (seconds) */
export const REDIS_VAULT_BALANCE_TTL_SECONDS = 30;

// ---------------------------------------------------------------------------
// BullMQ Queue Names
// ---------------------------------------------------------------------------

export const QUEUE_NAMES = {
  payoutBatch:      'payout-batch',
  pnlSnapshot:      'pnl-snapshot',
  evaluatorTick:    'evaluator-tick',
  marketCapFilter:  'market-cap-filter',
  heartbeat:        'heartbeat',
} as const;

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const API_BASE_PATH    = '/api/v1';
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE     = 100;

// ---------------------------------------------------------------------------
// Design System (shared with web + mobile)
// ---------------------------------------------------------------------------

export const COLORS = {
  primary:        '#7C3AED',
  background:     '#0A0A0A',
  surface:        '#111111',
  border:         '#222222',
  success:        '#22C55E',
  danger:         '#EF4444',
  warning:        '#F59E0B',
  textPrimary:    '#FFFFFF',
  textSecondary:  '#888888',
} as const;

export type ColorKey = keyof typeof COLORS;

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Minimum wallet address display length (truncated) */
export const WALLET_DISPLAY_CHARS = 4;

/**
 * Truncates a Solana wallet address for display: e.g. "5tkY...gukx"
 */
export function truncateWallet(address: string): string {
  if (address.length <= WALLET_DISPLAY_CHARS * 2 + 3) return address;
  return `${address.slice(0, WALLET_DISPLAY_CHARS)}...${address.slice(-WALLET_DISPLAY_CHARS)}`;
}

/**
 * Converts a USD dollar amount to token lamport units (6 decimals for USDC/USDT/USD1).
 */
export function usdToTokenUnits(usd: number, decimals = 6): bigint {
  return BigInt(Math.round(usd * 10 ** decimals));
}

/**
 * Converts token lamport units back to USD.
 */
export function tokenUnitsToUsd(units: bigint, decimals = 6): number {
  return Number(units) / 10 ** decimals;
}
