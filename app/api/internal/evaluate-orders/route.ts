import { NextResponse } from "next/server";
import { evaluateOrders } from "@/lib/orders/orderEvaluator";

export const dynamic = "force-dynamic";

// Internal-only trigger for the worker's order-evaluation timer (see
// worker/main.go's triggerOrderEvaluation). The actual matching/tax-lot/
// ledger logic stays here in TypeScript, already built and tested -
// the worker's job is just to call this on a schedule. evaluateOrders()
// already guards against overlapping calls via a per-order
// `FOR UPDATE SKIP LOCKED`, so no locking is needed at this layer.
export async function POST(request: Request) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "INTERNAL_API_SECRET not configured" },
      { status: 500 },
    );
  }

  const provided = request.headers.get("x-internal-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await evaluateOrders();
  return NextResponse.json({ ok: true });
}
