import { getCurrentUser } from "@/lib/auth/session";
import { subscribeToQuoteTicks } from "@/lib/quotes/quoteEvents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KEEPALIVE_INTERVAL_MS = 20_000;

// Server-Sent Events stream of quote ticks, filtered to the symbols a
// client asks for via ?symbols=AAPL,MSFT. Backed by Redis pub/sub via
// lib/quotes/quoteEvents.ts, fed by the Go worker's scheduled polling and
// the app's own on-demand single-symbol fetches.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const symbols = new Set(
    (searchParams.get("symbols") ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const unsubscribe = subscribeToQuoteTicks((payload) => {
        if (symbols.size > 0 && !symbols.has(payload.symbol)) return;
        controller.enqueue(
          encoder.encode(`event: quote\ndata: ${JSON.stringify(payload)}\n\n`),
        );
      });

      // Keeps intermediary proxies/browsers from timing out an idle
      // connection between real ticks.
      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, KEEPALIVE_INTERVAL_MS);

      request.signal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(keepAlive);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
