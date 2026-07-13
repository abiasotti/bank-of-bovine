import { Decimal, toMoney } from "@/lib/money";
import type { Quote, QuoteProvider } from "@/lib/quotes/QuoteProvider";

export interface RandomWalkOptions {
  initialPrices: Record<string, Decimal.Value>;
  // Standard deviation of the per-tick percentage change (0.005 = 0.5%).
  volatility?: number;
  // Starting price for a symbol not present in initialPrices - the mock
  // provider has no real market to validate against, so any symbol is
  // "valid" and gets lazily seeded at this price on first use.
  defaultPrice?: Decimal.Value;
}

const DEFAULT_VOLATILITY = 0.005;
const DEFAULT_STARTING_PRICE = new Decimal(100);
const MIN_PRICE = new Decimal("0.01");

export class RandomWalkQuoteProvider implements QuoteProvider {
  private prices = new Map<string, Decimal>();
  private volatility: number;
  private defaultPrice: Decimal;

  constructor(options: RandomWalkOptions) {
    this.volatility = options.volatility ?? DEFAULT_VOLATILITY;
    this.defaultPrice = options.defaultPrice
      ? toMoney(options.defaultPrice)
      : DEFAULT_STARTING_PRICE;
    for (const [symbol, price] of Object.entries(options.initialPrices)) {
      this.prices.set(symbol, toMoney(price));
    }
  }

  async getQuote(symbol: string): Promise<Quote> {
    const current = this.prices.get(symbol) ?? this.defaultPrice;
    const next = this.step(current);
    this.prices.set(symbol, next);
    return { symbol, price: next, asOf: new Date() };
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    return Promise.all(symbols.map((symbol) => this.getQuote(symbol)));
  }

  // The random walk provider doesn't regenerate history - historical price
  // data is served from persisted `quotes` rows by quoteService instead.
  async getHistoricalQuotes(): Promise<Quote[]> {
    return [];
  }

  private step(current: Decimal): Decimal {
    const pctChange = randomGaussian() * this.volatility;
    const next = current.times(new Decimal(1).plus(pctChange));
    return toMoney(Decimal.max(next, MIN_PRICE));
  }
}

// Box-Muller transform for a standard-normal random sample.
function randomGaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
