import { prisma } from "@/lib/db/client";
import { Decimal } from "@/lib/money";

// Cash balance is always derived by summing ledger_entries - never a
// mutable balance column. A brand-new account with zero entries sums to 0.
export async function getAccountBalance(accountId: string): Promise<Decimal> {
  const result = await prisma.ledgerEntry.aggregate({
    where: { accountId },
    _sum: { amount: true },
  });
  return new Decimal(result._sum.amount ?? 0);
}
