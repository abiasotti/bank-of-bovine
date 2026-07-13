import { describe, it, expect } from "vitest";
import { postLedgerEntry } from "@/lib/ledger/postLedgerEntry";

function makeFakeTx() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const created: any[] = [];
  return {
    tx: {
      ledgerEntry: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: async ({ data }: any) => {
          created.push(data);
          return data;
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    created,
  };
}

describe("postLedgerEntry", () => {
  it("rejects a buy/sell entry with no executionId", async () => {
    const { tx } = makeFakeTx();
    await expect(
      postLedgerEntry(tx, { accountId: "a", entryType: "buy", amount: "-100" }),
    ).rejects.toThrow();
  });

  it("rejects a seed_funding entry that provides an executionId", async () => {
    const { tx } = makeFakeTx();
    await expect(
      postLedgerEntry(tx, {
        accountId: "a",
        entryType: "seed_funding",
        amount: "500000",
        executionId: "e1",
      }),
    ).rejects.toThrow();
  });

  it("rejects a zero amount", async () => {
    const { tx } = makeFakeTx();
    await expect(
      postLedgerEntry(tx, {
        accountId: "a",
        entryType: "buy",
        amount: "0",
        executionId: "e1",
      }),
    ).rejects.toThrow();
  });

  it("creates a ledger entry preserving the signed amount", async () => {
    const { tx, created } = makeFakeTx();
    await postLedgerEntry(tx, {
      accountId: "a",
      entryType: "buy",
      amount: "-250.5",
      executionId: "e1",
    });
    expect(created[0].amount).toBe("-250.5");
    expect(created[0].executionId).toBe("e1");
  });

  it("creates a seed_funding entry with no executionId", async () => {
    const { tx, created } = makeFakeTx();
    await postLedgerEntry(tx, {
      accountId: "a",
      entryType: "seed_funding",
      amount: "500000",
    });
    expect(created[0].amount).toBe("500000");
    expect(created[0].executionId).toBeUndefined();
  });
});
