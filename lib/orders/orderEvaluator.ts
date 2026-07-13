import { prisma } from "@/lib/db/client";
import { Decimal } from "@/lib/money";
import { executeOrderFill, InsufficientFundsError } from "@/lib/orders/executeFill";
import { InsufficientSharesError } from "@/lib/taxlots/lotSelection";

interface EvaluableOrder {
  id: string;
  accountId: string;
  securityId: string;
  side: string;
  orderType: string;
  quantity: Decimal.Value;
  limitPrice: Decimal.Value | null;
  stopPrice: Decimal.Value | null;
  lotSelectionMethod: string | null;
  specificLotIds: string[];
}

function isMatched(order: EvaluableOrder, price: Decimal): boolean {
  if (order.orderType === "limit") {
    const limit = new Decimal(order.limitPrice!);
    return order.side === "buy"
      ? price.lessThanOrEqualTo(limit)
      : price.greaterThanOrEqualTo(limit);
  }
  if (order.orderType === "stop") {
    const stop = new Decimal(order.stopPrice!);
    return order.side === "buy"
      ? price.greaterThanOrEqualTo(stop)
      : price.lessThanOrEqualTo(stop);
  }
  // Market orders fill inline at creation and never reach the evaluator
  // as pending.
  return false;
}

// Called by the scheduler. Expires past-due day orders, then matches
// pending limit/stop orders against the latest quote per security and
// fills the ones whose condition is met - one DB transaction per order so
// a failure on one order never blocks the rest of the batch.
export async function evaluateOrders(): Promise<void> {
  const now = new Date();

  await prisma.order.updateMany({
    where: { status: "pending", timeInForce: "day", expiresAt: { lt: now } },
    data: { status: "expired" },
  });

  const pendingOrders = await prisma.order.findMany({
    where: { status: "pending", orderType: { in: ["limit", "stop"] } },
  });
  if (pendingOrders.length === 0) return;

  const securityIds = [...new Set(pendingOrders.map((o) => o.securityId))];
  const latestQuotes = await Promise.all(
    securityIds.map((securityId) =>
      prisma.quote.findFirst({
        where: { securityId },
        orderBy: { asOf: "desc" },
      }),
    ),
  );
  const priceBySecurityId = new Map(
    securityIds.map((id, index) => [id, latestQuotes[index]?.price]),
  );

  for (const order of pendingOrders) {
    const price = priceBySecurityId.get(order.securityId);
    if (price === undefined) continue;
    const priceDecimal = new Decimal(price);
    if (!isMatched(order, priceDecimal)) continue;

    try {
      await prisma.$transaction(async (tx) => {
        // Row-lock + re-check status so overlapping evaluator ticks never
        // double-fill the same order.
        const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
          SELECT id, status FROM orders WHERE id = ${order.id} FOR UPDATE SKIP LOCKED
        `;
        if (locked.length === 0 || locked[0].status !== "pending") return;

        await executeOrderFill(tx, order, priceDecimal);
      });
    } catch (error) {
      if (
        error instanceof InsufficientFundsError ||
        error instanceof InsufficientSharesError
      ) {
        // Leave the order pending and retry on a future tick rather than
        // cancelling it outright - conditions may change (funds added,
        // more shares acquired).
        continue;
      }
      console.error(`evaluateOrders: failed to fill order ${order.id}`, error);
    }
  }
}
