import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  cancelOrder,
  OrderNotCancellableError,
} from "@/lib/orders/orderService";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.account) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const order = await cancelOrder({
      orderId: id,
      accountId: user.account.id,
    });
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof OrderNotCancellableError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
