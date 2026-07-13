import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { createOrder, InvalidOrderError } from "@/lib/orders/orderService";
import { InsufficientFundsError } from "@/lib/orders/executeFill";
import {
  InsufficientSharesError,
  InvalidSpecificLotSelectionError,
} from "@/lib/taxlots/lotSelection";

const bodySchema = z.object({
  symbol: z.string(),
  side: z.enum(["buy", "sell"]),
  orderType: z.enum(["market", "limit", "stop"]),
  timeInForce: z.enum(["day", "gtc"]),
  quantity: z.string(),
  limitPrice: z.string().optional(),
  stopPrice: z.string().optional(),
  lotSelectionMethod: z.enum(["fifo", "lifo", "specific"]).optional(),
  specificLotIds: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.account) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const security = await prisma.security.findUnique({
    where: { symbol: parsed.data.symbol.toUpperCase() },
  });
  if (!security) {
    return NextResponse.json({ error: "unknown_symbol" }, { status: 400 });
  }

  try {
    const order = await createOrder({
      accountId: user.account.id,
      securityId: security.id,
      side: parsed.data.side,
      orderType: parsed.data.orderType,
      timeInForce: parsed.data.timeInForce,
      quantity: parsed.data.quantity,
      limitPrice: parsed.data.limitPrice,
      stopPrice: parsed.data.stopPrice,
      lotSelectionMethod: parsed.data.lotSelectionMethod,
      specificLotIds: parsed.data.specificLotIds,
    });
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    if (
      error instanceof InvalidOrderError ||
      error instanceof InsufficientFundsError ||
      error instanceof InsufficientSharesError ||
      error instanceof InvalidSpecificLotSelectionError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.account) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const orders = await prisma.order.findMany({
    where: { accountId: user.account.id },
    orderBy: { submittedAt: "desc" },
    include: { security: true },
  });
  return NextResponse.json({ orders });
}
