-- AlterTable
ALTER TABLE "positions" ADD COLUMN     "assetQuantity" DECIMAL(18,8) NOT NULL DEFAULT 0,
ADD COLUMN     "closeFee" DECIMAL(18,6),
ADD COLUMN     "closeReason" TEXT,
ADD COLUMN     "closedSize" DECIMAL(18,6) NOT NULL DEFAULT 0,
ADD COLUMN     "limitPrice" DECIMAL(18,6),
ADD COLUMN     "openFee" DECIMAL(18,6) NOT NULL DEFAULT 0,
ADD COLUMN     "orderStatus" TEXT NOT NULL DEFAULT 'FILLED',
ADD COLUMN     "orderType" TEXT NOT NULL DEFAULT 'MARKET',
ADD COLUMN     "remainingSize" DECIMAL(18,6) NOT NULL DEFAULT 0,
ADD COLUMN     "stopLoss" DECIMAL(18,6),
ADD COLUMN     "takeProfit" DECIMAL(18,6);

-- CreateIndex
CREATE INDEX "positions_attemptId_orderStatus_idx" ON "positions"("attemptId", "orderStatus");
