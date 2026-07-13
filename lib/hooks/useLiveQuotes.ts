"use client";

import { useEffect, useState } from "react";

export interface LiveQuote {
  price: string;
  asOf: string;
}

// Subscribes to /api/quotes/stream for the given symbols and returns the
// latest price seen for each, live-updated via SSE as the scheduler ticks.
// This is a live overlay on top of server-rendered data, not the source of
// truth - Postgres is - so a dropped connection just means the display
// stops updating until the next full page load, nothing breaks.
export function useLiveQuotes(symbols: string[]): Record<string, LiveQuote> {
  const [liveQuotes, setLiveQuotes] = useState<Record<string, LiveQuote>>({});
  const symbolsKey = [...new Set(symbols)].sort().join(",");

  useEffect(() => {
    if (!symbolsKey) return;

    const eventSource = new EventSource(
      `/api/quotes/stream?symbols=${encodeURIComponent(symbolsKey)}`,
    );

    eventSource.addEventListener("quote", (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as {
        symbol: string;
        price: string;
        asOf: string;
      };
      setLiveQuotes((prev) => ({
        ...prev,
        [payload.symbol]: { price: payload.price, asOf: payload.asOf },
      }));
    });

    return () => eventSource.close();
  }, [symbolsKey]);

  return liveQuotes;
}
