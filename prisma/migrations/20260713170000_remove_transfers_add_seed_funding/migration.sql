-- Every user now gets a fixed starting cash balance at registration
-- (see registerUser.ts) instead of funding their account via a
-- transfer from a fake external bank account - there's no funding flow
-- to model anymore.

-- CheckConstraint: replace the transferId/executionId pairing rule with an
-- entryType-driven one now that transfers no longer exist - buy/sell
-- entries must reference the execution that caused them, seed_funding
-- entries reference nothing (there's no source row to point at). Dropped
-- before the column so nothing references "transferId" once it's gone.
ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_exactly_one_reference";

-- DropForeignKey
ALTER TABLE "external_bank_accounts" DROP CONSTRAINT "external_bank_accounts_userId_fkey";

-- DropForeignKey
ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_transferId_fkey";

-- DropForeignKey
ALTER TABLE "transfers" DROP CONSTRAINT "transfers_accountId_fkey";

-- DropForeignKey
ALTER TABLE "transfers" DROP CONSTRAINT "transfers_externalBankAccountId_fkey";

-- AlterTable
ALTER TABLE "ledger_entries" DROP COLUMN "transferId";

-- DropTable
DROP TABLE "external_bank_accounts";

-- DropTable
DROP TABLE "transfers";

-- CheckConstraint: ledger_entries
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_entry_type_execution_reference" CHECK (
    ("entryType" IN ('buy', 'sell') AND "executionId" IS NOT NULL) OR
    ("entryType" = 'seed_funding' AND "executionId" IS NULL)
);
