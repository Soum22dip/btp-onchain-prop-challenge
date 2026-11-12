-- CreateEnum
CREATE TYPE "TraderStatus" AS ENUM ('ACTIVE', 'BANNED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('ACTIVE', 'PASSED', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "AttemptPhase" AS ENUM ('EVALUATION', 'FUNDED');

-- CreateEnum
CREATE TYPE "TokenSymbol" AS ENUM ('USDC', 'USDT', 'USD1');

-- CreateEnum
CREATE TYPE "Market" AS ENUM ('BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT', 'LTC', 'BCH', 'UNI', 'ATOM', 'ETC', 'APT', 'OP', 'ARB', 'INJ', 'SUI', 'SEI', 'NEAR', 'FTM', 'MATIC', 'IMX', 'STX', 'RNDR', 'MKR', 'AAVE', 'CRV', 'SNX', 'LDO', 'COMP', 'RUNE', 'FIL', 'ICP', 'BLUR', 'PEPE', 'SHIB', 'BONK', 'FLOKI', 'WLD', 'DYDX', 'GMX', 'GRT', 'ENS', 'SUSHI', 'AXS', 'SAND', 'MANA', 'GALA', 'CHZ', 'APE', 'FET', 'THETA', 'EOS', 'XLM', 'XMR', 'ZEC', 'KSM', 'KAVA', 'ONE', 'CELO', 'EGLD', 'FLOW', 'ALGO', 'VET', 'IOTA', 'XTZ', 'ZIL', 'BAT', 'HNT', 'QNT', 'MASK', 'GNS', 'RPL', 'TON', 'TRX', 'CFX', 'PENDLE', 'TWT', 'XAU', 'XAG', 'WTI', 'BRENT', 'SPY', 'QQQ', 'IWM', 'EUR_USD', 'GBP_USD', 'AUD_USD', 'NZD_USD', 'USD_JPY', 'USD_CAD', 'USD_CHF', 'USD_CNH', 'USD_SGD', 'USD_MXN');

-- CreateEnum
CREATE TYPE "PositionSide" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'CLOSED', 'LIQUIDATED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FraudFlag" AS ENUM ('UNUSUAL_PNL', 'RAPID_OPEN_CLOSE', 'SUSPICIOUS_PATTERN', 'MULTIPLE_ACCOUNTS');

-- CreateTable
CREATE TABLE "traders" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "status" "TraderStatus" NOT NULL DEFAULT 'ACTIVE',
    "fraudFlags" "FraudFlag"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "traders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "traderId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "phase" "AttemptPhase" NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'ACTIVE',
    "accountSize" DECIMAL(18,6) NOT NULL,
    "startingBalance" DECIMAL(18,6) NOT NULL,
    "currentBalance" DECIMAL(18,6) NOT NULL,
    "peakBalance" DECIMAL(18,6) NOT NULL,
    "profitTarget" DECIMAL(18,6) NOT NULL,
    "maxDrawdownFloor" DECIMAL(18,6) NOT NULL,
    "realizedPnl" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unrealizedPnl" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalPayoutTaken" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "tokenUsed" "TokenSymbol" NOT NULL,
    "txSignature" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_snapshots" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "balance" DECIMAL(18,6) NOT NULL,
    "pnlPercent" DECIMAL(10,6) NOT NULL,
    "drawdownPercent" DECIMAL(10,6) NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attempt_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "traderId" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "side" "PositionSide" NOT NULL,
    "status" "PositionStatus" NOT NULL DEFAULT 'OPEN',
    "entryPrice" DECIMAL(18,6) NOT NULL,
    "exitPrice" DECIMAL(18,6),
    "size" DECIMAL(18,6) NOT NULL,
    "leverage" DECIMAL(8,2) NOT NULL,
    "marginUsed" DECIMAL(18,6) NOT NULL,
    "realizedPnl" DECIMAL(18,6),
    "unrealizedPnl" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "fundingPaid" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_requests" (
    "id" TEXT NOT NULL,
    "traderId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "amountUsd" DECIMAL(18,6) NOT NULL,
    "tokenSymbol" "TokenSymbol" NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "batchId" TEXT,
    "onchainTxSignature" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "payout_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_batches" (
    "id" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "totalRequests" INTEGER NOT NULL DEFAULT 0,
    "totalAmountUsd" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "adminTxSignature" TEXT,
    "successful" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payout_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_flag_records" (
    "id" TEXT NOT NULL,
    "traderId" TEXT NOT NULL,
    "flag" "FraudFlag" NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "flaggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "flaggedBy" TEXT NOT NULL,

    CONSTRAINT "fraud_flag_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "traders_walletAddress_key" ON "traders"("walletAddress");

-- CreateIndex
CREATE INDEX "traders_walletAddress_idx" ON "traders"("walletAddress");

-- CreateIndex
CREATE INDEX "traders_status_idx" ON "traders"("status");

-- CreateIndex
CREATE INDEX "attempts_traderId_idx" ON "attempts"("traderId");

-- CreateIndex
CREATE INDEX "attempts_traderId_status_idx" ON "attempts"("traderId", "status");

-- CreateIndex
CREATE INDEX "attempts_traderId_attemptNumber_idx" ON "attempts"("traderId", "attemptNumber");

-- CreateIndex
CREATE INDEX "attempts_status_idx" ON "attempts"("status");

-- CreateIndex
CREATE INDEX "attempt_snapshots_attemptId_idx" ON "attempt_snapshots"("attemptId");

-- CreateIndex
CREATE INDEX "attempt_snapshots_attemptId_snapshotAt_idx" ON "attempt_snapshots"("attemptId", "snapshotAt");

-- CreateIndex
CREATE INDEX "positions_attemptId_idx" ON "positions"("attemptId");

-- CreateIndex
CREATE INDEX "positions_traderId_idx" ON "positions"("traderId");

-- CreateIndex
CREATE INDEX "positions_traderId_status_idx" ON "positions"("traderId", "status");

-- CreateIndex
CREATE INDEX "positions_attemptId_status_idx" ON "positions"("attemptId", "status");

-- CreateIndex
CREATE INDEX "payout_requests_traderId_idx" ON "payout_requests"("traderId");

-- CreateIndex
CREATE INDEX "payout_requests_attemptId_idx" ON "payout_requests"("attemptId");

-- CreateIndex
CREATE INDEX "payout_requests_status_idx" ON "payout_requests"("status");

-- CreateIndex
CREATE INDEX "payout_requests_batchId_idx" ON "payout_requests"("batchId");

-- CreateIndex
CREATE INDEX "payout_requests_traderId_status_idx" ON "payout_requests"("traderId", "status");

-- CreateIndex
CREATE INDEX "payout_batches_scheduledAt_idx" ON "payout_batches"("scheduledAt");

-- CreateIndex
CREATE INDEX "payout_batches_processedAt_idx" ON "payout_batches"("processedAt");

-- CreateIndex
CREATE INDEX "fraud_flag_records_traderId_idx" ON "fraud_flag_records"("traderId");

-- CreateIndex
CREATE INDEX "fraud_flag_records_flag_idx" ON "fraud_flag_records"("flag");

-- CreateIndex
CREATE INDEX "fraud_flag_records_flaggedAt_idx" ON "fraud_flag_records"("flaggedAt");

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "traders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_snapshots" ADD CONSTRAINT "attempt_snapshots_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "traders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "traders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "payout_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_flag_records" ADD CONSTRAINT "fraud_flag_records_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "traders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
