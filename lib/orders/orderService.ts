import { prisma } from "@/lib/db/client";
import { Decimal, toMoney, toShareQuantity, isPositive } from "@/lib/money";
import { executeOrderFill } from "@/lib/orders/executeFill";

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop";
export type TimeInForce = "day" | "gtc";
export type LotSelectionMethod = "fifo" | "lifo" | "specific";

export class InvalidOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOrderError";
  }
}

export class OrderNotCancellableError extends Error {
  constructor() {
    super("Only pending orders can be cancelled.");
    this.name = "OrderNotCancellableError";
  }
}

interface CreateOrderInput {
  accountId: string;
  securityId: string;
  side: OrderSide;
  orderType: OrderType;
  timeInForce: TimeInForce;
  quantity: Decimal.Value;
  limitPrice?: Decimal.Value;
  stopPrice?: Decimal.Value;
  lotSelectionMethod?: LotSelectionMethod;
  specificLotIds?: string[];
}

function endOfDayUtc(from: Date): Date {
  const end = new Date(from);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

// No partial fills in Phase 1: an order either fills completely or stays
// pending/cancelled/expired. Market orders fill inline in the same
// transaction as order creation - if the fill fails (e.g. insufficient
// funds), the whole order creation rolls back rather than leaving a
// dangling pending row for an order type that was never meant to wait.
export async function createOrder(input: CreateOrderInput) {
  const quantity = toShareQuantity(input.quantity);
  if (!isPositive(quantity)) {
    throw new InvalidOrderError("Order quantity must be greater than zero.");
  }
  if (input.orderType === "limit" && input.limitPrice === undefined) {
    throw new InvalidOrderError("Limit orders require a limit price.");
  }
  if (input.orderType === "stop" && input.stopPrice === undefined) {
    throw new InvalidOrderError("Stop orders require a stop price.");
  }
  if (input.side === "sell" && !input.lotSelectionMethod) {
    throw new InvalidOrderError(
      "Sell orders require a lot selection method.",
    );
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        accountId: input.accountId,
        securityId: input.securityId,
        side: input.side,
        orderType: input.orderType,
        timeInForce: input.timeInForce,
        quantity: quantity.toString(),
        limitPrice:
          input.limitPrice !== undefined
            ? toMoney(input.limitPrice).toString()
            : undefined,
        stopPrice:
          input.stopPrice !== undefined
            ? toMoney(input.stopPrice).toString()
            : undefined,
        lotSelectionMethod:
          input.side === "sell" ? input.lotSelectionMethod : undefined,
        specificLotIds: input.specificLotIds ?? [],
        status: "pending",
        submittedAt: now,
        expiresAt: input.timeInForce === "day" ? endOfDayUtc(now) : undefined,
      },
    });

    if (input.orderType === "market") {
      const latestQuote = await tx.quote.findFirst({
        where: { securityId: input.securityId },
        orderBy: { asOf: "desc" },
      });
      if (!latestQuote) {
        throw new InvalidOrderError(
          "No quote available for this security yet.",
        );
      }

      await executeOrderFill(tx, order, latestQuote.price);
      return tx.order.findUniqueOrThrow({ where: { id: order.id } });
    }

    return order;
  });
}

export async function cancelOrder(params: {
  orderId: string;
  accountId: string;
}) {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
  });
  if (!order || order.accountId !== params.accountId) {
    throw new OrderNotCancellableError();
  }
  if (order.status !== "pending") {
    throw new OrderNotCancellableError();
  }

  return prisma.order.update({
    where: { id: order.id },
    data: { status: "cancelled", cancelledAt: new Date() },
  });
}
