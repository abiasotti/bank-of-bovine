import { prisma } from "@/lib/db/client";
import { Decimal } from "@/lib/money";
import type { Quote, QuoteProvider } from "@/lib/quotes/QuoteProvider";
import { RandomWalkQuoteProvider } from "@/lib/quotes/RandomWalkQuoteProvider";
import { FinnhubQuoteProvider } from "@/lib/quotes/FinnhubQuoteProvider";
import { publishQuoteTick } from "@/lib/quotes/quoteEvents";

function toQuoteCreateData(securityId: string, source: QuoteProviderKind, quote: Quote) {
  return {
    securityId,
    price: quote.price.toString(),
    asOf: quote.asOf,
    source,
    dayHigh: quote.dayHigh?.toString(),
    dayLow: quote.dayLow?.toString(),
    dayOpen: quote.dayOpen?.toString(),
    previousClose: quote.previousClose?.toString(),
  };
}

export type QuoteProviderKind = "mock" | "finnhub";

// This module is the only thing in the app that talks to a QuoteProvider
// directly - used for the on-demand single-symbol fetch (findOrCreateSecurity
// looking up a brand-new symbol, and ensureFreshQuote refreshing a stale
// one). Scheduled background polling for watched/held securities is now
// entirely owned by the Go worker (worker/internal/quotes), which talks to
// Postgres and Redis directly - see worker/main.go's tickQuotes(). Portfolio,
// watchlist, and order evaluation all read the latest persisted quote from
// Postgres, never call a provider themselves.
let cachedProvider: QuoteProvider | null = null;
let cachedProviderKind: QuoteProviderKind | null = null;

export function getQuoteProviderKind(): QuoteProviderKind {
  const kind = process.env.QUOTE_PROVIDER ?? "mock";
  if (kind !== "mock" && kind !== "finnhub") {
    throw new Error(`Unsupported QUOTE_PROVIDER: ${kind}`);
  }
  return kind;
}

async function getProvider(): Promise<QuoteProvider> {
  const providerKind = getQuoteProviderKind();
  if (cachedProvider && cachedProviderKind === providerKind) {
    return cachedProvider;
  }

  if (providerKind === "finnhub") {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      throw new Error("QUOTE_PROVIDER=finnhub requires FINNHUB_API_KEY to be set");
    }
    cachedProvider = new FinnhubQuoteProvider({ apiKey });
    cachedProviderKind = providerKind;
    return cachedProvider;
  }

  const securities = await prisma.security.findMany({
    where: { isActive: true },
  });

  const initialPrices: Record<string, Decimal.Value> = {};
  for (const security of securities) {
    const latest = await prisma.quote.findFirst({
      where: { securityId: security.id },
      orderBy: { asOf: "desc" },
    });
    initialPrices[security.symbol] = latest?.price ?? 100;
  }

  cachedProvider = new RandomWalkQuoteProvider({ initialPrices });
  cachedProviderKind = providerKind;
  return cachedProvider;
}

const STALE_QUOTE_THRESHOLD_MS = 60_000;

// Fetches one symbol from the active provider and persists it. Throws on
// failure (invalid symbol, rate limit, network error) - callers that need
// to know whether a symbol is genuinely valid (e.g. creating a brand-new
// Security) should call this directly. See ensureFreshQuote below for the
// resilient, best-effort variant used for symbols that already exist.
export async function fetchAndPersistQuote(
  securityId: string,
  symbol: string,
) {
  const providerKind = getQuoteProviderKind();
  const provider = await getProvider();
  const quote = await provider.getQuote(symbol);
  const created = await prisma.quote.create({
    data: toQuoteCreateData(securityId, providerKind, quote),
  });
  void publishQuoteTick({
    symbol: quote.symbol,
    price: quote.price.toString(),
    asOf: quote.asOf.toISOString(),
  });
  return created;
}

// On-demand freshness check for a security that already exists, used when
// a page needs to show a symbol that isn't necessarily watched/held (and
// so isn't covered by the worker's background polling). Self-throttled by
// the staleness check, so repeated views of the same page don't re-fetch
// on every request. Unlike fetchAndPersistQuote, failures are swallowed -
// a transient provider hiccup shouldn't break the page for a symbol that
// already has a (slightly stale) quote to fall back on.
export async function ensureFreshQuote(
  securityId: string,
  symbol: string,
): Promise<void> {
  const latest = await getLatestQuoteBySecurityId(securityId);
  const isStale =
    !latest || Date.now() - latest.asOf.getTime() > STALE_QUOTE_THRESHOLD_MS;
  if (!isStale) return;

  try {
    await fetchAndPersistQuote(securityId, symbol);
  } catch (error) {
    console.error(`ensureFreshQuote: failed to refresh ${symbol}`, error);
  }
}

export async function getLatestQuoteBySecurityId(securityId: string) {
  return prisma.quote.findFirst({
    where: { securityId },
    orderBy: { asOf: "desc" },
  });
}

export async function getLatestQuoteBySymbol(symbol: string) {
  const security = await prisma.security.findUnique({ where: { symbol } });
  if (!security) return null;
  return getLatestQuoteBySecurityId(security.id);
}
