import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { getAccountBalance } from "@/lib/ledger/getAccountBalance";
import { STARTING_CASH_BALANCE } from "@/lib/auth/registerUser";
import { createTestUser, truncateTestData } from "./testHelpers";

describe("registerUser (integration)", () => {
  afterEach(async () => {
    await truncateTestData();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("seeds every new account with the fixed starting cash balance", async () => {
    const { account } = await createTestUser();

    expect((await getAccountBalance(account.id)).toString()).toBe(
      STARTING_CASH_BALANCE,
    );

    const entries = await prisma.ledgerEntry.findMany({
      where: { accountId: account.id },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].entryType).toBe("seed_funding");
    expect(entries[0].executionId).toBeNull();
  });

  it("gives two independently-registered accounts the same starting balance", async () => {
    const { account: accountA } = await createTestUser();
    const { account: accountB } = await createTestUser();

    const balanceA = await getAccountBalance(accountA.id);
    const balanceB = await getAccountBalance(accountB.id);
    expect(balanceA.toString()).toBe(balanceB.toString());
  });
});
