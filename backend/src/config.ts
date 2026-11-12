// =============================================================================
// Setl8 Backend — Runtime Configuration
//
// ALL environment variable access is centralised here.
// No other file in the backend may reference process.env directly.
//
// Validation runs once at startup. If any required variable is missing or
// invalid the process exits immediately with a descriptive error so the
// failure is caught at deploy time, not silently at runtime.
// =============================================================================

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`[config] Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function optionalEnv(name: string, defaultValue: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : defaultValue;
}

function requirePort(name: string): number {
  const raw = requireEnv(name);
  const port = parseInt(raw, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`[config] ${name} must be a valid port number (1–65535), got: "${raw}"`);
  }
  return port;
}

function loadConfig() {
  // Collect all missing variables before throwing so the operator sees
  // every problem in one error message instead of one at a time.
  const errors: string[] = [];

  function safe(fn: () => string | number): string | number | null {
    try {
      return fn();
    } catch (e) {
      errors.push((e as Error).message);
      return null;
    }
  }

  const databaseUrl       = safe(() => requireEnv('DATABASE_URL'));
  const redisUrl          = safe(() => requireEnv('REDIS_URL'));
  const jwtSecret         = safe(() => requireEnv('JWT_SECRET'));
  const solanaRpcUrl      = safe(() => requireEnv('SOLANA_RPC_URL'));
  const protocolWallet    = safe(() => requireEnv('PROTOCOL_WALLET'));
  const protocolKeypair   = safe(() => requireEnv('PROTOCOL_WALLET_KEYPAIR'));
  // Payout vault is now a PDA — keypair no longer needed
  const payoutVaultAddr   = optionalEnv('PAYOUT_VAULT_ADDRESS', '');
  const adminSecret       = safe(() => requireEnv('ADMIN_SECRET'));
  const port              = safe(() => requirePort('PORT'));

  // Optional / defaulted
  const nodeEnv              = optionalEnv('NODE_ENV', 'development');
  const vaultProgramId       = optionalEnv('VAULT_PROGRAM_ID', '');
  const corsOrigin           = optionalEnv('CORS_ORIGIN', '');
  const vaultFireIntervalHrs = parseInt(optionalEnv('VAULT_FIRE_INTERVAL_HOURS', '120'), 10);
  const telegramBotToken     = optionalEnv('TELEGRAM_BOT_TOKEN', '');
  const telegramWebhookUrl   = optionalEnv('TELEGRAM_WEBHOOK_URL', '');

  if (errors.length > 0) {
    throw new Error(
      `[config] Startup aborted — ${errors.length} missing environment variable(s):\n  • ${errors.join('\n  • ')}`
    );
  }

  return {
    /** PostgreSQL connection string */
    databaseUrl:          databaseUrl as string,

    /** Redis connection string */
    redisUrl:             redisUrl as string,

    /** Secret key for signing JWTs */
    jwtSecret:            jwtSecret as string,

    /** Solana RPC URL (Helius devnet/mainnet) */
    solanaRpcUrl:         solanaRpcUrl as string,

    /**
     * On-chain program ID for the Setl8 vault.
     * Empty string until the program is deployed; validated downstream when
     * Solana interactions are attempted.
     */
    vaultProgramId,

    /** Protocol wallet public key (admin signer + 30 % fee recipient) */
    protocolWallet:       protocolWallet as string,

    /**
     * Path or base64-encoded keypair for the protocol wallet.
     * In production this is a base64 env var on Railway, never a file path.
     */
    protocolKeypair:      protocolKeypair as string,

    /** Payout vault public key (legacy — now derived as PDA) */
    payoutVaultAddress:   payoutVaultAddr,

    /** Secret passed in X-Admin-Secret header to access /admin/* routes */
    adminSecret:          adminSecret as string,

    /** HTTP port the Fastify server listens on */
    port:                 port as number,

    /** NODE_ENV: "development" | "production" | "test" */
    nodeEnv,

    /**
     * Allowed CORS origin for production.  Empty string means "block all"
     * cross-origin requests (safe default; dev overrides this to true/all).
     */
    corsOrigin,

    /**
     * Vault fire interval in hours (default 120 = 5 days).
     * Set VAULT_FIRE_INTERVAL_HOURS=1 in .env for fast dev testing.
     */
    vaultFireIntervalHours: vaultFireIntervalHrs,

    /** Telegram bot token (optional — bot disabled if empty) */
    telegramBotToken:      telegramBotToken,

    /** Telegram webhook URL (optional — uses long polling if empty) */
    telegramWebhookUrl:    telegramWebhookUrl,

    /** Convenience booleans */
    isDev:                nodeEnv === 'development',
    isProd:               nodeEnv === 'production',
    isTest:               nodeEnv === 'test',
  } as const;
}

// Run validation immediately when this module is imported.
export const config = loadConfig();
