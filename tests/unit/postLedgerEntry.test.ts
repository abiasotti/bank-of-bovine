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
  it("rejects when neither transferId nor executionId is provided", async () => {
    const { tx } = makeFakeTx();
    await expect(
      postLedgerEntry(tx, { accountId: "a", entryType: "buy", amount: "-100" }),
    ).rejects.toThrow();
  });

  it("rejects when both transferId and executionId are provided", async () => {
    const { tx } = makeFakeTx();
    await expect(
      postLedgerEntry(tx, {
        accountId: "a",
        entryType: "buy",
        amount: "-100",
        transferId: "t1",
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
    expect(created[0].transferId).toBeUndefined();
    expect(created[0].executionId).toBe("e1");
  });
});
