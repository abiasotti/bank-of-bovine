import { prisma } from "@/lib/db/client";
import { Decimal, toMoney, isPositive } from "@/lib/money";
import { postLedgerEntry } from "@/lib/ledger/postLedgerEntry";

export class InvalidTransferAmountError extends Error {
  constructor() {
    super("Transfer amount must be greater than zero.");
    this.name = "InvalidTransferAmountError";
  }
}

interface CreateTransferInput {
  accountId: string;
  externalBankAccountId: string;
  amount: Decimal.Value;
}

// Funding is modeled as a real transfer from the external (fake, infinite
// balance) bank account into the brokerage account, not an arbitrary
// "add funds" button - see brokerage-sim-spec.md "Funding / Transfer
// Mechanic". Single-entry per transfer: only the brokerage account gets a
// ledger row, since the external account has no real balance to reconcile.
export async function createTransfer(input: CreateTransferInput) {
  const amount = toMoney(input.amount);
  if (!isPositive(amount)) {
    throw new InvalidTransferAmountError();
  }

  return prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: {
        accountId: input.accountId,
        externalBankAccountId: input.externalBankAccountId,
        direction: "deposit",
        amount: amount.toString(),
        status: "completed",
      },
    });

    await postLedgerEntry(tx, {
      accountId: input.accountId,
      entryType: "transfer_in",
      amount,
      transferId: transfer.id,
    });

    return transfer;
  });
}
