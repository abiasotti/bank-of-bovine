import { toMoney } from "@/lib/money";
import type { Quote, QuoteProvider } from "@/lib/quotes/QuoteProvider";
import { UnknownSymbolError } from "@/lib/quotes/QuoteProvider";

const BASE_URL = "https://finnhub.io/api/v1";

interface FinnhubQuoteResponse {
  c: number; // current price
  d: number | null; // change
  dp: number | null; // percent change
  h: number; // high of day
  l: number; // low of day
  o: number; // open
  pc: number; // previous close
  t: number; // unix timestamp (seconds)
}

export class FinnhubRequestError extends Error {
  constructor(
    public readonly symbol: string,
    public readonly status: number,
  ) {
    super(`Finnhub request for ${symbol} failed with status ${status}`);
    this.name = "FinnhubRequestError";
  }
}

export interface FinnhubQuoteProviderOptions {
  apiKey: string;
  // Injectable for tests - defaults to the global fetch.
  fetchImpl?: typeof fetch;
}

// Real Finnhub-backed implementation of QuoteProvider (see
// lib/quotes/QuoteProvider.ts). Confirmed against the live API during
// development:
//   - GET https://finnhub.io/api/v1/quote?symbol=X&token=Y -> {c,d,dp,h,l,o,pc,t}
//   - free tier is rate-limited to 60 req/min (confirmed via
//     x-ratelimit-limit response header)
//   - free tier has NO access to /stock/candle (historical OHLC) - confirmed
//     via a live request returning {"error":"You don't have access to this
//     resource."} - so getHistoricalQuotes() stays a stub here, same as the
//     mock provider; historical data is accumulated in our own `quotes`
//     table by polling instead (see quoteService.ts).
//   - an unknown/invalid symbol returns an all-zero payload with t=0,
//     confirmed live - that's how we detect UnknownSymbolError.
export class FinnhubQuoteProvider implements QuoteProvider {
  private apiKey: string;
  private fetchImpl: typeof fetch;

  constructor(options: FinnhubQuoteProviderOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const url = `${BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${this.apiKey}`;
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new FinnhubRequestError(symbol, response.status);
    }

    const data = (await response.json()) as FinnhubQuoteResponse;
    if (data.c === 0 && data.t === 0) {
      throw new UnknownSymbolError(symbol);
    }

    return {
      symbol,
      price: toMoney(data.c),
      asOf: new Date(data.t * 1000),
      dayHigh: toMoney(data.h),
      dayLow: toMoney(data.l),
      dayOpen: toMoney(data.o),
      previousClose: toMoney(data.pc),
    };
  }

  // The free tier has no batch/multi-symbol quote endpoint, so symbols are
  // fetched one at a time, sequentially (not Promise.all) to avoid bursting
  // requests against the 60 req/min limit. A single symbol's failure (rate
  // limit, transient error, delisted ticker) is logged and skipped rather
  // than aborting the whole batch - a partial tick is far better than none.
  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const quotes: Quote[] = [];
    for (const symbol of symbols) {
      try {
        quotes.push(await this.getQuote(symbol));
      } catch (error) {
        console.error(`FinnhubQuoteProvider: failed to fetch ${symbol}`, error);
      }
    }
    return quotes;
  }

  async getHistoricalQuotes(): Promise<Quote[]> {
    return [];
  }
}

export interface FinnhubSearchResult {
  symbol: string;
  name: string;
}

interface FinnhubSearchResponse {
  count: number;
  result: Array<{
    description: string;
    displaySymbol: string;
    symbol: string;
    type: string;
  }>;
}

// Confirmed live: shares the same 60 req/min budget as /quote (same
// x-ratelimit-limit header). Non-US listings come back with a dotted
// exchange suffix (e.g. "603020.SS", "STMPA.PA") - filtered out here since
// the spec scopes quotes to US equities ("international exchanges may be
// delayed or EOD-only").
export async function searchFinnhubSymbols(
  query: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FinnhubSearchResult[]> {
  const url = `${BASE_URL}/search?q=${encodeURIComponent(query)}&token=${apiKey}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new FinnhubRequestError(query, response.status);
  }

  const data = (await response.json()) as FinnhubSearchResponse;
  return data.result
    .filter((r) => !r.symbol.includes("."))
    .map((r) => ({ symbol: r.symbol, name: r.description }));
}
