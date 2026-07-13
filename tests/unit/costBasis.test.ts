import { describe, it, expect } from "vitest";
import { applyLotConsumptions } from "@/lib/taxlots/costBasisService";
import { Decimal } from "@/lib/money";

function makeFakeTx() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const created: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updated: any[] = [];
  return {
    tx: {
      lotConsumption: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: async ({ data }: any) => {
          created.push(data);
          return data;
        },
      },
      taxLot: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: async ({ where, data }: any) => {
          updated.push({ where, data });
          return data;
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    created,
    updated,
  };
}

describe("applyLotConsumptions", () => {
  it("computes realized gain/loss per lot and sums correctly across a multi-lot sell", async () => {
    const { tx, created } = makeFakeTx();
    const total = await applyLotConsumptions(tx, {
      executionId: "exec1",
      sellPricePerShare: "150",
      plan: [
        {
          taxLotId: "lot1",
          quantityConsumed: new Decimal(10),
          costBasisPerShare: new Decimal(100),
        },
        {
          taxLotId: "lot2",
          quantityConsumed: new Decimal(5),
          costBasisPerShare: new Decimal(120),
        },
      ],
    });

    // (150-100)*10 + (150-120)*5 = 500 + 150 = 650
    expect(total.toString()).toBe("650");
    expect(created).toHaveLength(2);
    expect(created[0].realizedGainLoss).toBe("500");
    expect(created[1].realizedGainLoss).toBe("150");
  });

  it("decrements each consumed lot's open quantity atomically", async () => {
    const { tx, updated } = makeFakeTx();
    await applyLotConsumptions(tx, {
      executionId: "exec1",
      sellPricePerShare: "100",
      plan: [
        {
          taxLotId: "lot1",
          quantityConsumed: new Decimal(3),
          costBasisPerShare: new Decimal(90),
        },
      ],
    });
    expect(updated[0].where).toEqual({ id: "lot1" });
    expect(updated[0].data.openQuantity.decrement).toBe("3");
  });

  it("computes a loss as a negative realized gain/loss", async () => {
    const { tx } = makeFakeTx();
    const total = await applyLotConsumptions(tx, {
      executionId: "exec1",
      sellPricePerShare: "80",
      plan: [
        {
          taxLotId: "lot1",
          quantityConsumed: new Decimal(10),
          costBasisPerShare: new Decimal(100),
        },
      ],
    });
    expect(total.toString()).toBe("-200");
  });

  it("snapshots each lot's cost basis at consumption time rather than re-reading it later", async () => {
    const { tx, created } = makeFakeTx();
    await applyLotConsumptions(tx, {
      executionId: "exec1",
      sellPricePerShare: "100",
      plan: [
        {
          taxLotId: "lot1",
          quantityConsumed: new Decimal(1),
          costBasisPerShare: new Decimal(42.5),
        },
      ],
    });
    expect(created[0].costBasisPerShare).toBe("42.5");
  });
});
