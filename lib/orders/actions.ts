"use server";

import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import {
  createOrder,
  cancelOrder,
  InvalidOrderError,
  OrderNotCancellableError,
} from "@/lib/orders/orderService";
import { InsufficientFundsError } from "@/lib/orders/executeFill";
import {
  InsufficientSharesError,
  InvalidSpecificLotSelectionError,
} from "@/lib/taxlots/lotSelection";

export type CreateOrderActionResult =
  | { ok: true }
  | { ok: false; error: string };

// Used by the Trade modal (a client component), so it returns a result
// instead of redirecting - a modal has nowhere to redirect *to*, it just
// needs to know whether to show an error or close itself.
export async function createOrderAction(
  formData: FormData,
): Promise<CreateOrderActionResult> {
  const user = await requireCurrentUser();
  if (!user.account) {
    throw new Error("Account not fully provisioned");
  }

  const symbol = String(formData.get("symbol") ?? "");
  const security = await prisma.security.findUnique({ where: { symbol } });
  if (!security) {
    return { ok: false, error: "Unknown symbol." };
  }

  const side = String(formData.get("side") ?? "");
  const orderType = String(formData.get("orderType") ?? "");
  const timeInForce = String(formData.get("timeInForce") ?? "");
  const quantity = String(formData.get("quantity") ?? "");
  const limitPriceRaw = String(formData.get("limitPrice") ?? "").trim();
  const stopPriceRaw = String(formData.get("stopPrice") ?? "").trim();
  const lotSelectionMethod = String(
    formData.get("lotSelectionMethod") ?? "fifo",
  );
  const specificLotIds = formData.getAll("specificLotIds").map(String);

  try {
    await createOrder({
      accountId: user.account.id,
      securityId: security.id,
      side: side as "buy" | "sell",
      orderType: orderType as "market" | "limit" | "stop",
      timeInForce: timeInForce as "day" | "gtc",
      quantity,
      limitPrice: limitPriceRaw || undefined,
      stopPrice: stopPriceRaw || undefined,
      lotSelectionMethod:
        side === "sell"
          ? (lotSelectionMethod as "fifo" | "lifo" | "specific")
          : undefined,
      specificLotIds: specificLotIds.length > 0 ? specificLotIds : undefined,
    });
  } catch (error) {
    if (
      error instanceof InvalidOrderError ||
      error instanceof InsufficientFundsError ||
      error instanceof InsufficientSharesError ||
      error instanceof InvalidSpecificLotSelectionError
    ) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  return { ok: true };
}

export async function cancelOrderAction(orderId: string) {
  const user = await requireCurrentUser();
  if (!user.account) {
    throw new Error("Account not fully provisioned");
  }

  try {
    await cancelOrder({ orderId, accountId: user.account.id });
  } catch (error) {
    if (error instanceof OrderNotCancellableError) {
      redirect(`/orders?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  redirect("/orders");
}
