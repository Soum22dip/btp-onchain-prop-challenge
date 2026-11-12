-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "inTrailingMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tradeStartBalance" DECIMAL(20,6) NOT NULL DEFAULT 0;
