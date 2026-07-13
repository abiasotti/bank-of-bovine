import { describe, it, expect } from "vitest";
import { RandomWalkQuoteProvider } from "@/lib/quotes/RandomWalkQuoteProvider";

describe("RandomWalkQuoteProvider", () => {
  it("returns quotes for known symbols and advances over successive calls", async () => {
    const provider = new RandomWalkQuoteProvider({
      initialPrices: { AAPL: "100" },
    });
    const q1 = await provider.getQuote("AAPL");
    const q2 = await provider.getQuote("AAPL");
    expect(q1.symbol).toBe("AAPL");
    expect(q1.price.greaterThan(0)).toBe(true);
    expect(q2.asOf.getTime()).toBeGreaterThanOrEqual(q1.asOf.getTime());
  });

  it("lazily seeds a symbol it wasn't pre-loaded with at the default starting price, rather than rejecting it - the mock provider has no real market to validate a ticker against", async () => {
    const provider = new RandomWalkQuoteProvider({
      initialPrices: { AAPL: "100" },
      defaultPrice: "250",
    });
    const quote = await provider.getQuote("ZZZZ");
    expect(quote.symbol).toBe("ZZZZ");
    // First call advances one step from the default starting price, so it
    // won't be exactly 250, but should be close given the default 0.5% vol.
    expect(quote.price.minus(250).abs().lessThan(10)).toBe(true);
  });

  it("never produces a non-positive price even under extreme volatility", async () => {
    const provider = new RandomWalkQuoteProvider({
      initialPrices: { AAPL: "1" },
      volatility: 50,
    });
    for (let i = 0; i < 200; i++) {
      const quote = await provider.getQuote("AAPL");
      expect(quote.price.greaterThan(0)).toBe(true);
    }
  });

  it("getQuotes returns exactly one quote per requested symbol", async () => {
    const provider = new RandomWalkQuoteProvider({
      initialPrices: { AAPL: "100", MSFT: "200" },
    });
    const quotes = await provider.getQuotes(["AAPL", "MSFT"]);
    expect(quotes.map((q) => q.symbol).sort()).toEqual(["AAPL", "MSFT"]);
  });

  it("getHistoricalQuotes returns empty - history is served from persisted DB rows instead", async () => {
    const provider = new RandomWalkQuoteProvider({
      initialPrices: { AAPL: "100" },
    });
    const history = await provider.getHistoricalQuotes(
      "AAPL",
      new Date(0),
      new Date(),
    );
    expect(history).toEqual([]);
  });
});
