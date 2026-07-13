import type { Prisma } from "@/lib/generated/prisma/client";
import { Decimal, toMoney } from "@/lib/money";

export type LedgerEntryType = "seed_funding" | "buy" | "sell";

interface PostLedgerEntryInput {
  accountId: string;
  entryType: LedgerEntryType;
  amount: Decimal.Value; // signed: positive = credit, negative = debit
  executionId?: string;
  occurredAt?: Date;
}

// Must be called with a transaction client and inside the same transaction
// as the execution row it references (buy/sell), so a failed execution
// never leaves an orphaned ledger entry. Mirrors the DB CHECK constraint:
// buy/sell entries require an executionId, seed_funding entries must not
// have one (there's no source row to point at - it's the account's fixed
// starting balance).
export async function postLedgerEntry(
  tx: Prisma.TransactionClient,
  input: PostLedgerEntryInput,
) {
  const requiresExecution = input.entryType === "buy" || input.entryType === "sell";
  const hasExecution = Boolean(input.executionId);
  if (requiresExecution !== hasExecution) {
    throw new Error(
      requiresExecution
        ? `postLedgerEntry: entryType "${input.entryType}" requires an executionId`
        : `postLedgerEntry: entryType "${input.entryType}" must not have an executionId`,
    );
  }

  const amount = toMoney(input.amount);
  if (amount.isZero()) {
    throw new Error("postLedgerEntry amount must be nonzero");
  }

  return tx.ledgerEntry.create({
    data: {
      accountId: input.accountId,
      entryType: input.entryType,
      amount: amount.toString(),
      executionId: input.executionId,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
}
