import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  createTransfer,
  InvalidTransferAmountError,
} from "@/lib/ledger/transferService";
import { getAccountBalance } from "@/lib/ledger/getAccountBalance";
import { createTestUser, truncateTestData } from "./testHelpers";

describe("transfer flow (integration)", () => {
  afterEach(async () => {
    await truncateTestData();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("funding transfers accumulate into the derived cash balance and are logged", async () => {
    const { account, externalBankAccount } = await createTestUser();

    expect((await getAccountBalance(account.id)).toString()).toBe("0");

    await createTransfer({
      accountId: account.id,
      externalBankAccountId: externalBankAccount.id,
      amount: "1000.50",
    });
    expect((await getAccountBalance(account.id)).toString()).toBe("1000.5");

    await createTransfer({
      accountId: account.id,
      externalBankAccountId: externalBankAccount.id,
      amount: "500",
    });
    expect((await getAccountBalance(account.id)).toString()).toBe("1500.5");

    const transfers = await prisma.transfer.findMany({
      where: { accountId: account.id },
    });
    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: { accountId: account.id },
    });
    expect(transfers).toHaveLength(2);
    // Single-entry per transfer: only the brokerage account gets a row.
    expect(ledgerEntries).toHaveLength(2);
  });

  it("rejects zero and negative transfer amounts without writing any rows", async () => {
    const { account, externalBankAccount } = await createTestUser();

    await expect(
      createTransfer({
        accountId: account.id,
        externalBankAccountId: externalBankAccount.id,
        amount: "0",
      }),
    ).rejects.toBeInstanceOf(InvalidTransferAmountError);

    await expect(
      createTransfer({
        accountId: account.id,
        externalBankAccountId: externalBankAccount.id,
        amount: "-10",
      }),
    ).rejects.toBeInstanceOf(InvalidTransferAmountError);

    expect(await prisma.transfer.count({ where: { accountId: account.id } })).toBe(
      0,
    );
  });
});
