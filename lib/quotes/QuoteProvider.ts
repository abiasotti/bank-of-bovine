import type { Decimal } from "@/lib/money";

export interface Quote {
  symbol: string;
  price: Decimal;
  asOf: Date;
  // Day high/low/open + previous close, when the provider has them (real
  // providers only - the mock provider has no real OHLC concept).
  dayHigh?: Decimal;
  dayLow?: Decimal;
  dayOpen?: Decimal;
  previousClose?: Decimal;
}

// Shaped to match what a real Finnhub client would expose, so swapping the
// mock implementation for a real one later touches only the provider
// implementation + its DI wiring in quoteService.ts, never callers.
export interface QuoteProvider {
  getQuote(symbol: string): Promise<Quote>;
  getQuotes(symbols: string[]): Promise<Quote[]>;
  getHistoricalQuotes(symbol: string, from: Date, to: Date): Promise<Quote[]>;
}

// A provider telling us it doesn't recognize a ticker. Only a *real* data
// source can say this - the mock provider treats any symbol as valid (it
// has no concept of a "real" market to validate against), so only
// FinnhubQuoteProvider ever throws it.
export class UnknownSymbolError extends Error {
  constructor(symbol: string) {
    super(`Unknown symbol: ${symbol}`);
    this.name = "UnknownSymbolError";
  }
}
