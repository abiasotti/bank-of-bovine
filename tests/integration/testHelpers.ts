import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { registerUser } from "@/lib/auth/registerUser";

// registerUser() seeds the new account with STARTING_CASH_BALANCE
// automatically, so callers don't need to fund the returned account
// themselves.
export async function createTestUser() {
  const user = await registerUser({
    email: `test-${randomUUID()}@example.com`,
    password: "correcthorsebatterystaple",
    displayName: "Test User",
  });
  const account = await prisma.account.findUniqueOrThrow({
    where: { userId: user.id },
  });
  return { user, account };
}

// Clears all user-generated data between tests while leaving the seeded
// securities/quotes catalog intact. CASCADE handles FK ordering regardless
// of the list order.
export async function truncateTestData() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE lot_consumptions, ledger_entries, tax_lots, executions, orders,
             watchlist_items, watchlists, accounts, users CASCADE
  `);
}
