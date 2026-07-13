import type { Prisma } from "@/lib/generated/prisma/client";
import { Decimal, toMoney, toShareQuantity } from "@/lib/money";
import { postLedgerEntry } from "@/lib/ledger/postLedgerEntry";
import {
  selectLotsToConsume,
  type LotSelectionMethod,
} from "@/lib/taxlots/lotSelection";
import { applyLotConsumptions } from "@/lib/taxlots/costBasisService";

export class InsufficientFundsError extends Error {
  constructor() {
    super("Insufficient cash balance to complete this buy.");
    this.name = "InsufficientFundsError";
  }
}

interface OrderLike {
  id: string;
  accountId: string;
  securityId: string;
  side: string; // 'buy' | 'sell'
  quantity: Decimal.Value;
  lotSelectionMethod: string | null;
  specificLotIds: string[];
}

// Shared by market-order creation (fills inline) and the evaluator
// (limit/stop fills). One DB transaction per fill: execution row, buy ->
// tax lot / sell -> lot consumption + realized gain/loss, ledger posting,
// and order status update all succeed or fail together.
export async function executeOrderFill(
  tx: Prisma.TransactionClient,
  order: OrderLike,
  fillPrice: Decimal.Value,
): Promise<void> {
  const quantity = toShareQuantity(order.quantity);
  const price = toMoney(fillPrice);

  if (order.side === "buy") {
    const cost = toMoney(quantity.times(price));

    const balanceResult = await tx.ledgerEntry.aggregate({
      where: { accountId: order.accountId },
      _sum: { amount: true },
    });
    const balance = new Decimal(balanceResult._sum.amount ?? 0);
    if (balance.lessThan(cost)) {
      throw new InsufficientFundsError();
    }

    const execution = await tx.execution.create({
      data: {
        orderId: order.id,
        accountId: order.accountId,
        securityId: order.securityId,
        side: "buy",
        quantity: quantity.toString(),
        price: price.toString(),
      },
    });

    await tx.taxLot.create({
      data: {
        accountId: order.accountId,
        securityId: order.securityId,
        executionId: execution.id,
        quantity: quantity.toString(),
        openQuantity: quantity.toString(),
        costBasisPerShare: price.toString(),
        acquiredAt: execution.executedAt,
      },
    });

    await postLedgerEntry(tx, {
      accountId: order.accountId,
      entryType: "buy",
      amount: cost.negated(),
      executionId: execution.id,
    });
  } else {
    const method = (order.lotSelectionMethod ?? "fifo") as LotSelectionMethod;
    const plan = await selectLotsToConsume(tx, {
      accountId: order.accountId,
      securityId: order.securityId,
      quantity,
      method,
      specificLotIds: order.specificLotIds,
    });

    const execution = await tx.execution.create({
      data: {
        orderId: order.id,
        accountId: order.accountId,
        securityId: order.securityId,
        side: "sell",
        quantity: quantity.toString(),
        price: price.toString(),
      },
    });

    const realizedGainLoss = await applyLotConsumptions(tx, {
      executionId: execution.id,
      sellPricePerShare: price,
      plan,
    });

    await tx.execution.update({
      where: { id: execution.id },
      data: { realizedGainLoss: realizedGainLoss.toString() },
    });

    const proceeds = toMoney(quantity.times(price));
    await postLedgerEntry(tx, {
      accountId: order.accountId,
      entryType: "sell",
      amount: proceeds,
      executionId: execution.id,
    });
  }

  await tx.order.update({
    where: { id: order.id },
    data: { status: "filled", filledAt: new Date() },
  });
}
