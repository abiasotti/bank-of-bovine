-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "dayHigh" DECIMAL(18,4),
ADD COLUMN     "dayLow" DECIMAL(18,4),
ADD COLUMN     "dayOpen" DECIMAL(18,4),
ADD COLUMN     "previousClose" DECIMAL(18,4);
