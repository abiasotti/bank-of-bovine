import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { registerUser } from "@/lib/auth/registerUser";

export async function createTestUser() {
  const user = await registerUser({
    email: `test-${randomUUID()}@example.com`,
    password: "correcthorsebatterystaple",
    displayName: "Test User",
  });
  const account = await prisma.account.findUniqueOrThrow({
    where: { userId: user.id },
  });
  const externalBankAccount = await prisma.externalBankAccount.findUniqueOrThrow(
    { where: { userId: user.id } },
  );
  return { user, account, externalBankAccount };
}

// Clears all user-generated data between tests while leaving the seeded
// securities/quotes catalog intact. CASCADE handles FK ordering regardless
// of the list order.
export async function truncateTestData() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE lot_consumptions, ledger_entries, tax_lots, executions, orders,
             transfers, watchlist_items, watchlists, external_bank_accounts,
             accounts, users CASCADE
  `);
}
