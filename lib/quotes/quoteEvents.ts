import { EventEmitter } from "node:events";
import Redis from "ioredis";

export interface QuoteTickPayload {
  symbol: string;
  price: string;
  asOf: string;
}

// Must match QuoteChannel in worker/internal/publish/publish.go.
const QUOTE_CHANNEL = "quotes";

// Real Redis pub/sub, replacing the in-process EventEmitter used before
// the Go worker existed. The worker publishes ticks to the `quotes` Redis
// channel directly for its own scheduled polling; publishQuoteTick here is
// used by the app's on-demand single-symbol fetch (fetchAndPersistQuote in
// quoteService.ts), so both paths round-trip through the same channel and
// behave identically regardless of which process triggered them.
//
// A Redis connection in subscribe mode can't run other commands, so the
// subscriber and publisher are two separate connections. Locally within
// this process, ticks still fan out via an EventEmitter so N browser tabs
// don't each open their own Redis connection - same globalThis-singleton
// pattern as lib/db/client.ts to survive Next.js dev-mode HMR.
const globalForEvents = globalThis as unknown as {
  quoteLocalEmitter: EventEmitter | undefined;
  quoteRedisSubscriber: Redis | undefined;
  quoteRedisPublisher: Redis | undefined;
};

const localEmitter = globalForEvents.quoteLocalEmitter ?? new EventEmitter();
localEmitter.setMaxListeners(0); // unbounded SSE subscribers
if (process.env.NODE_ENV !== "production") {
  globalForEvents.quoteLocalEmitter = localEmitter;
}

function getRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL is required for live quote push");
  }
  return redisUrl;
}

function getSubscriber(): Redis {
  if (globalForEvents.quoteRedisSubscriber) {
    return globalForEvents.quoteRedisSubscriber;
  }

  const subscriber = new Redis(getRedisUrl());
  subscriber.subscribe(QUOTE_CHANNEL).catch((error) => {
    console.error("quoteEvents: failed to subscribe to Redis channel", error);
  });
  subscriber.on("message", (_channel, message) => {
    try {
      const payload = JSON.parse(message) as QuoteTickPayload;
      localEmitter.emit("quote", payload);
    } catch (error) {
      console.error("quoteEvents: failed to parse Redis message", error);
    }
  });
  subscriber.on("error", (error) => {
    console.error("quoteEvents: Redis subscriber error", error);
  });

  if (process.env.NODE_ENV !== "production") {
    globalForEvents.quoteRedisSubscriber = subscriber;
  }
  return subscriber;
}

function getPublisher(): Redis {
  if (globalForEvents.quoteRedisPublisher) {
    return globalForEvents.quoteRedisPublisher;
  }

  const publisher = new Redis(getRedisUrl());
  publisher.on("error", (error) => {
    console.error("quoteEvents: Redis publisher error", error);
  });

  if (process.env.NODE_ENV !== "production") {
    globalForEvents.quoteRedisPublisher = publisher;
  }
  return publisher;
}

export async function publishQuoteTick(
  payload: QuoteTickPayload,
): Promise<void> {
  const publisher = getPublisher();
  await publisher.publish(QUOTE_CHANNEL, JSON.stringify(payload));
}

export function subscribeToQuoteTicks(
  listener: (payload: QuoteTickPayload) => void,
): () => void {
  getSubscriber(); // ensure the Redis subscription is established
  localEmitter.on("quote", listener);
  return () => localEmitter.off("quote", listener);
}
