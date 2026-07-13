import type { Prisma } from "@/lib/generated/prisma/client";
import { Decimal, toShareQuantity } from "@/lib/money";

export type LotSelectionMethod = "fifo" | "lifo" | "specific";

export class InsufficientSharesError extends Error {
  constructor() {
    super("Not enough open shares to complete this sell.");
    this.name = "InsufficientSharesError";
  }
}

export class InvalidSpecificLotSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSpecificLotSelectionError";
  }
}

export interface LotConsumptionPlanItem {
  taxLotId: string;
  quantityConsumed: Decimal;
  costBasisPerShare: Decimal;
}

interface SelectLotsInput {
  accountId: string;
  securityId: string;
  quantity: Decimal.Value;
  method: LotSelectionMethod;
  specificLotIds?: string[];
}

// Must run inside the same transaction as the execution/lot_consumptions
// writes it feeds, so it reads open_quantity live and never oversells
// against stale data from an earlier read in the same request.
//
// "specific" selection (schema stores a flat specificLotIds: string[] on
// Order, with no per-lot quantity breakdown) is implemented as: restrict
// the eligible pool to the caller-chosen lots, then consume them in the
// order the caller listed them, until the sell quantity is satisfied.
export async function selectLotsToConsume(
  tx: Prisma.TransactionClient,
  input: SelectLotsInput,
): Promise<LotConsumptionPlanItem[]> {
  const sellQuantity = toShareQuantity(input.quantity);

  const openLots = await tx.taxLot.findMany({
    where: {
      accountId: input.accountId,
      securityId: input.securityId,
      openQuantity: { gt: 0 },
    },
    orderBy: { acquiredAt: input.method === "lifo" ? "desc" : "asc" },
  });

  let eligibleLots = openLots;
  if (input.method === "specific") {
    const requestedIds = input.specificLotIds ?? [];
    if (requestedIds.length === 0) {
      throw new InvalidSpecificLotSelectionError(
        "Specific-lot sells require at least one lot id.",
      );
    }
    const openLotIds = new Set(openLots.map((lot) => lot.id));
    for (const id of requestedIds) {
      if (!openLotIds.has(id)) {
        throw new InvalidSpecificLotSelectionError(
          `Lot ${id} does not belong to this account/security or has no open quantity.`,
        );
      }
    }
    const requestedOrder = new Map(
      requestedIds.map((id, index) => [id, index]),
    );
    eligibleLots = openLots
      .filter((lot) => requestedOrder.has(lot.id))
      .sort((a, b) => requestedOrder.get(a.id)! - requestedOrder.get(b.id)!);
  }

  const plan: LotConsumptionPlanItem[] = [];
  let remaining = sellQuantity;

  for (const lot of eligibleLots) {
    if (remaining.lessThanOrEqualTo(0)) break;
    const available = new Decimal(lot.openQuantity);
    const take = Decimal.min(available, remaining);
    if (take.lessThanOrEqualTo(0)) continue;
    plan.push({
      taxLotId: lot.id,
      quantityConsumed: take,
      costBasisPerShare: new Decimal(lot.costBasisPerShare),
    });
    remaining = remaining.minus(take);
  }

  if (remaining.greaterThan(0)) {
    throw new InsufficientSharesError();
  }

  return plan;
}
