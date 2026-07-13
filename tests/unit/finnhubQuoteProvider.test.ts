import { describe, it, expect, vi } from "vitest";
import {
  FinnhubQuoteProvider,
  FinnhubRequestError,
  searchFinnhubSymbols,
} from "@/lib/quotes/FinnhubQuoteProvider";
import { UnknownSymbolError } from "@/lib/quotes/QuoteProvider";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("FinnhubQuoteProvider", () => {
  it("parses a real-shaped Finnhub quote response (c/t confirmed live against the API)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ c: 317.06, d: 1.74, dp: 0.55, h: 323.45, l: 316.09, o: 316.5, pc: 315.32, t: 1783958311 }),
    );
    const provider = new FinnhubQuoteProvider({ apiKey: "test-key", fetchImpl });

    const quote = await provider.getQuote("AAPL");

    expect(quote.symbol).toBe("AAPL");
    expect(quote.price.toString()).toBe("317.06");
    expect(quote.asOf.getTime()).toBe(1783958311 * 1000);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://finnhub.io/api/v1/quote?symbol=AAPL&token=test-key",
    );
  });

  it("treats an all-zero payload (c=0, t=0) as an unknown symbol - confirmed live for an invalid ticker", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 }),
    );
    const provider = new FinnhubQuoteProvider({ apiKey: "test-key", fetchImpl });

    await expect(provider.getQuote("NOTAREALSYMBOL")).rejects.toBeInstanceOf(
      UnknownSymbolError,
    );
  });

  it("throws FinnhubRequestError on a non-ok HTTP response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 429));
    const provider = new FinnhubQuoteProvider({ apiKey: "test-key", fetchImpl });

    await expect(provider.getQuote("AAPL")).rejects.toBeInstanceOf(
      FinnhubRequestError,
    );
  });

  it("getQuotes fetches symbols sequentially and skips a failing symbol instead of aborting the whole batch", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ c: 100, d: 1, dp: 1, h: 101, l: 99, o: 99, pc: 99, t: 1000 }),
      )
      .mockResolvedValueOnce(jsonResponse({}, false, 500))
      .mockResolvedValueOnce(
        jsonResponse({ c: 200, d: 1, dp: 1, h: 201, l: 199, o: 199, pc: 199, t: 2000 }),
      );
    const provider = new FinnhubQuoteProvider({ apiKey: "test-key", fetchImpl });

    const quotes = await provider.getQuotes(["AAPL", "BROKEN", "MSFT"]);

    expect(quotes.map((q) => q.symbol)).toEqual(["AAPL", "MSFT"]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("getHistoricalQuotes returns empty - the free tier has no candle access (confirmed live: 403 'no access to this resource')", async () => {
    const provider = new FinnhubQuoteProvider({
      apiKey: "test-key",
      fetchImpl: vi.fn(),
    });
    const history = await provider.getHistoricalQuotes(
      "AAPL",
      new Date(0),
      new Date(),
    );
    expect(history).toEqual([]);
  });
});

describe("searchFinnhubSymbols", () => {
  it("parses a real-shaped search response and filters out non-US listings (confirmed live: dotted-suffix symbols like 603020.SS, STMPA.PA)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        count: 3,
        result: [
          { description: "Apple Inc", displaySymbol: "AAPL", symbol: "AAPL", type: "Common Stock" },
          { description: "Apple Flavor & Fragrance Group Co Ltd", displaySymbol: "603020.SS", symbol: "603020.SS", type: "Common Stock" },
          { description: "Apple Hospitality REIT Inc", displaySymbol: "APLE", symbol: "APLE", type: "Common Stock" },
        ],
      }),
    );

    const results = await searchFinnhubSymbols("apple", "test-key", fetchImpl);

    expect(results).toEqual([
      { symbol: "AAPL", name: "Apple Inc" },
      { symbol: "APLE", name: "Apple Hospitality REIT Inc" },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://finnhub.io/api/v1/search?q=apple&token=test-key",
    );
  });

  it("throws FinnhubRequestError on a non-ok HTTP response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 429));
    await expect(
      searchFinnhubSymbols("apple", "test-key", fetchImpl),
    ).rejects.toBeInstanceOf(FinnhubRequestError);
  });
});
