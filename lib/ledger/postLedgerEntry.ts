import type { Prisma } from "@/lib/generated/prisma/client";
import { Decimal, toMoney } from "@/lib/money";

export type LedgerEntryType = "transfer_in" | "buy" | "sell";

interface PostLedgerEntryInput {
  accountId: string;
  entryType: LedgerEntryType;
  amount: Decimal.Value; // signed: positive = credit, negative = debit
  transferId?: string;
  executionId?: string;
  occurredAt?: Date;
}

// Must be called with a transaction client and inside the same transaction
// as the transfer/execution row it references, so a failed execution never
// leaves an orphaned ledger entry. Mirrors the DB CHECK constraint that
// exactly one of transferId/executionId is set.
export async function postLedgerEntry(
  tx: Prisma.TransactionClient,
  input: PostLedgerEntryInput,
) {
  const hasTransfer = Boolean(input.transferId);
  const hasExecution = Boolean(input.executionId);
  if (hasTransfer === hasExecution) {
    throw new Error(
      "postLedgerEntry requires exactly one of transferId or executionId",
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
      transferId: input.transferId,
      executionId: input.executionId,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
}
