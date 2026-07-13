import { describe, it, expect } from "vitest";
import { isMarketOpen } from "@/lib/market/marketHours";

describe("isMarketOpen", () => {
  it("is open at the 9:30am ET open (EDT, summer)", () => {
    expect(isMarketOpen(new Date("2026-07-15T13:30:00Z"))).toBe(true);
  });

  it("is closed one minute before the open (EDT, summer)", () => {
    expect(isMarketOpen(new Date("2026-07-15T13:29:00Z"))).toBe(false);
  });

  it("is open one minute before the 4:00pm ET close (EDT, summer)", () => {
    expect(isMarketOpen(new Date("2026-07-15T19:59:00Z"))).toBe(true);
  });

  it("is closed at the 4:00pm ET close (EDT, summer)", () => {
    expect(isMarketOpen(new Date("2026-07-15T20:00:00Z"))).toBe(false);
  });

  it("is open at the 9:30am ET open (EST, winter)", () => {
    expect(isMarketOpen(new Date("2026-01-14T14:30:00Z"))).toBe(true);
  });

  it("is closed at the 4:00pm ET close (EST, winter)", () => {
    expect(isMarketOpen(new Date("2026-01-14T21:00:00Z"))).toBe(false);
  });

  it("is closed on a Saturday, even during trading hours ET", () => {
    expect(isMarketOpen(new Date("2026-07-18T16:00:00Z"))).toBe(false);
  });

  it("is closed overnight", () => {
    expect(isMarketOpen(new Date("2026-07-15T04:00:00Z"))).toBe(false);
  });
});
