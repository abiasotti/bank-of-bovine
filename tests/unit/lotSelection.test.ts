import { describe, it, expect } from "vitest";
import {
  selectLotsToConsume,
  InsufficientSharesError,
  InvalidSpecificLotSelectionError,
} from "@/lib/taxlots/lotSelection";

interface FakeLot {
  id: string;
  openQuantity: string;
  costBasisPerShare: string;
  acquiredAt: Date;
}

function makeFakeTx(lots: FakeLot[]) {
  return {
    taxLot: {
      findMany: async ({
        orderBy,
      }: {
        orderBy: { acquiredAt: "asc" | "desc" };
      }) => {
        return [...lots].sort((a, b) =>
          orderBy.acquiredAt === "asc"
            ? a.acquiredAt.getTime() - b.acquiredAt.getTime()
            : b.acquiredAt.getTime() - a.acquiredAt.getTime(),
        );
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const lot1: FakeLot = {
  id: "lot1",
  openQuantity: "10",
  costBasisPerShare: "100",
  acquiredAt: new Date("2026-01-01"),
};
const lot2: FakeLot = {
  id: "lot2",
  openQuantity: "5",
  costBasisPerShare: "120",
  acquiredAt: new Date("2026-02-01"),
};
const lot3: FakeLot = {
  id: "lot3",
  openQuantity: "5",
  costBasisPerShare: "90",
  acquiredAt: new Date("2026-03-01"),
};

describe("selectLotsToConsume", () => {
  it("FIFO consumes the oldest lots first, spanning multiple lots", async () => {
    const tx = makeFakeTx([lot1, lot2, lot3]);
    const plan = await selectLotsToConsume(tx, {
      accountId: "a",
      securityId: "s",
      quantity: "12",
      method: "fifo",
    });
    expect(
      plan.map((p) => [p.taxLotId, p.quantityConsumed.toString()]),
    ).toEqual([
      ["lot1", "10"],
      ["lot2", "2"],
    ]);
  });

  it("LIFO consumes the newest lots first", async () => {
    const tx = makeFakeTx([lot1, lot2, lot3]);
    const plan = await selectLotsToConsume(tx, {
      accountId: "a",
      securityId: "s",
      quantity: "7",
      method: "lifo",
    });
    expect(
      plan.map((p) => [p.taxLotId, p.quantityConsumed.toString()]),
    ).toEqual([
      ["lot3", "5"],
      ["lot2", "2"],
    ]);
  });

  it("FIFO and LIFO select different lots for the same sell (proves method selection changes behavior)", async () => {
    const fifoPlan = await selectLotsToConsume(makeFakeTx([lot1, lot2, lot3]), {
      accountId: "a",
      securityId: "s",
      quantity: "10",
      method: "fifo",
    });
    const lifoPlan = await selectLotsToConsume(makeFakeTx([lot1, lot2, lot3]), {
      accountId: "a",
      securityId: "s",
      quantity: "10",
      method: "lifo",
    });

    const fifoCostBasis = fifoPlan.reduce(
      (sum, p) => sum + Number(p.quantityConsumed) * Number(p.costBasisPerShare),
      0,
    );
    const lifoCostBasis = lifoPlan.reduce(
      (sum, p) => sum + Number(p.quantityConsumed) * Number(p.costBasisPerShare),
      0,
    );
    expect(fifoCostBasis).not.toBe(lifoCostBasis);
  });

  it("rejects a sell that exceeds total open quantity across all lots", async () => {
    const tx = makeFakeTx([lot1]);
    await expect(
      selectLotsToConsume(tx, {
        accountId: "a",
        securityId: "s",
        quantity: "999",
        method: "fifo",
      }),
    ).rejects.toBeInstanceOf(InsufficientSharesError);
  });

  it("specific-lot selection consumes only the named lots, in the order given", async () => {
    const tx = makeFakeTx([lot1, lot2, lot3]);
    const plan = await selectLotsToConsume(tx, {
      accountId: "a",
      securityId: "s",
      quantity: "8",
      method: "specific",
      specificLotIds: ["lot3", "lot1"],
    });
    expect(
      plan.map((p) => [p.taxLotId, p.quantityConsumed.toString()]),
    ).toEqual([
      ["lot3", "5"],
      ["lot1", "3"],
    ]);
  });

  it("rejects specific-lot selection referencing a lot outside the open pool", async () => {
    const tx = makeFakeTx([lot1]);
    await expect(
      selectLotsToConsume(tx, {
        accountId: "a",
        securityId: "s",
        quantity: "1",
        method: "specific",
        specificLotIds: ["does-not-exist"],
      }),
    ).rejects.toBeInstanceOf(InvalidSpecificLotSelectionError);
  });

  it("rejects specific-lot selection with no lot ids provided", async () => {
    const tx = makeFakeTx([lot1]);
    await expect(
      selectLotsToConsume(tx, {
        accountId: "a",
        securityId: "s",
        quantity: "1",
        method: "specific",
        specificLotIds: [],
      }),
    ).rejects.toBeInstanceOf(InvalidSpecificLotSelectionError);
  });
});
