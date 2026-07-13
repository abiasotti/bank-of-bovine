import type { Prisma } from "@/lib/generated/prisma/client";
import { Decimal, toMoney } from "@/lib/money";
import type { LotConsumptionPlanItem } from "@/lib/taxlots/lotSelection";

// Applies a lot-consumption plan: decrements each lot's open_quantity and
// records a lot_consumptions row per lot (auditable, since a single sell
// can span multiple lots with the cost basis frozen at consumption time).
// Returns the total realized gain/loss for the sell.
export async function applyLotConsumptions(
  tx: Prisma.TransactionClient,
  params: {
    executionId: string;
    sellPricePerShare: Decimal.Value;
    plan: LotConsumptionPlanItem[];
  },
): Promise<Decimal> {
  const sellPrice = toMoney(params.sellPricePerShare);
  let totalRealizedGainLoss = new Decimal(0);

  for (const item of params.plan) {
    const realizedGainLoss = toMoney(
      sellPrice.minus(item.costBasisPerShare).times(item.quantityConsumed),
    );
    totalRealizedGainLoss = totalRealizedGainLoss.plus(realizedGainLoss);

    await tx.lotConsumption.create({
      data: {
        executionId: params.executionId,
        taxLotId: item.taxLotId,
        quantityConsumed: item.quantityConsumed.toString(),
        costBasisPerShare: item.costBasisPerShare.toString(),
        realizedGainLoss: realizedGainLoss.toString(),
      },
    });

    await tx.taxLot.update({
      where: { id: item.taxLotId },
      data: { openQuantity: { decrement: item.quantityConsumed.toString() } },
    });
  }

  return toMoney(totalRealizedGainLoss);
}
