import { prisma } from "@/lib/db/client";
import type { Security } from "@/lib/generated/prisma/client";
import {
  getQuoteProviderKind,
  fetchAndPersistQuote,
  ensureFreshQuote,
} from "@/lib/quotes/quoteService";
import {
  searchFinnhubSymbols,
  type FinnhubSearchResult,
} from "@/lib/quotes/FinnhubQuoteProvider";
import { UnknownSymbolError } from "@/lib/quotes/QuoteProvider";

export class InvalidSymbolError extends Error {
  constructor(symbol: string) {
    super(`"${symbol}" is not a recognized ticker.`);
    this.name = "InvalidSymbolError";
  }
}

function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

function isValidSymbolFormat(symbol: string): boolean {
  return /^[A-Z0-9.\-]{1,10}$/.test(symbol);
}

// Looks up a security by symbol, creating it on demand if it's not yet in
// our DB - this is what "opens up to the full market": the securities
// catalog is no longer limited to prisma/seed.ts, any symbol the active
// provider recognizes becomes tradable the moment someone looks it up.
//
// nameHint lets a caller that already knows the company/fund name (e.g.
// from a search result) skip an extra name-lookup request; direct
// navigation to an unseeded symbol (no hint) falls back to using the
// symbol itself as the name, since Finnhub's free-tier company-profile
// endpoint returns {} for both ETFs and invalid tickers alike (confirmed
// live) and so can't be used to validate or name a symbol reliably.
export async function findOrCreateSecurity(
  symbolRaw: string,
  nameHint?: string,
): Promise<Security> {
  const symbol = normalizeSymbol(symbolRaw);
  if (!isValidSymbolFormat(symbol)) {
    throw new InvalidSymbolError(symbol);
  }

  const existing = await prisma.security.findUnique({ where: { symbol } });
  if (existing) {
    await ensureFreshQuote(existing.id, existing.symbol);
    return existing;
  }

  const providerKind = getQuoteProviderKind();
  const created = await prisma.security.create({
    data: {
      symbol,
      name: nameHint ?? symbol,
      exchange: providerKind === "finnhub" ? "US" : "MOCK",
    },
  });

  try {
    await fetchAndPersistQuote(created.id, created.symbol);
  } catch (error) {
    // Roll back: either the provider doesn't recognize this ticker, or we
    // couldn't get any price for it - either way, don't leave an unpriced
    // Security row behind for something nobody can actually trade. Safe to
    // delete unconditionally here since fetchAndPersistQuote failing means
    // no quote (or anything else) was ever created against this row.
    await prisma.security.delete({ where: { id: created.id } }).catch(() => {});
    if (error instanceof UnknownSymbolError) {
      throw new InvalidSymbolError(symbol);
    }
    throw error;
  }

  return created;
}

export interface SecuritySearchResults {
  // Already in our DB - clicking through is instant, no validation needed.
  known: Security[];
  // Recognized by Finnhub but not yet in our DB - clicking through creates
  // it on demand via findOrCreateSecurity. Empty when QUOTE_PROVIDER=mock,
  // since the mock provider has no real market to discover symbols from.
  discoverable: FinnhubSearchResult[];
}

export async function searchSecurities(
  query: string,
): Promise<SecuritySearchResults> {
  const trimmed = query.trim();
  if (!trimmed) return { known: [], discoverable: [] };

  const known = await prisma.security.findMany({
    where: {
      isActive: true,
      OR: [
        { symbol: { contains: trimmed, mode: "insensitive" } },
        { name: { contains: trimmed, mode: "insensitive" } },
      ],
    },
    orderBy: { symbol: "asc" },
    take: 20,
  });

  const providerKind = getQuoteProviderKind();
  const apiKey = process.env.FINNHUB_API_KEY;
  if (providerKind !== "finnhub" || !apiKey) {
    return { known, discoverable: [] };
  }

  const knownSymbols = new Set(known.map((s) => s.symbol));
  try {
    const results = await searchFinnhubSymbols(trimmed, apiKey);
    const discoverable = results
      .filter((r) => !knownSymbols.has(r.symbol))
      .slice(0, 20);
    return { known, discoverable };
  } catch (error) {
    console.error("searchSecurities: Finnhub search failed", error);
    return { known, discoverable: [] };
  }
}
