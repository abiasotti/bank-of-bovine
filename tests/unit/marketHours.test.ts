import { describe, it, expect } from "vitest";
import { isMarketOpen, nextMarketClose } from "@/lib/market/marketHours";

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

describe("nextMarketClose", () => {
  it("returns today's close when placed during regular hours (EDT)", () => {
    // Wed 2026-07-15 11:00 ET
    expect(nextMarketClose(new Date("2026-07-15T15:00:00Z")).toISOString()).toBe(
      "2026-07-15T20:00:00.000Z", // Wed 2026-07-15 4:00pm ET
    );
  });

  it("returns today's close when placed during regular hours (EST)", () => {
    // Wed 2026-01-14 11:00 ET
    expect(nextMarketClose(new Date("2026-01-14T16:00:00Z")).toISOString()).toBe(
      "2026-01-14T21:00:00.000Z", // Wed 2026-01-14 4:00pm EST
    );
  });

  it("rolls to the next day's close when placed after today's close", () => {
    // Mon 2026-07-13 18:00 ET (after the 4pm close)
    expect(nextMarketClose(new Date("2026-07-13T22:00:00Z")).toISOString()).toBe(
      "2026-07-14T20:00:00.000Z", // Tue 2026-07-14 4:00pm ET
    );
  });

  it("skips the weekend, rolling Friday after-hours to Monday's close", () => {
    // Fri 2026-07-17 18:00 ET (after the 4pm close)
    expect(nextMarketClose(new Date("2026-07-17T22:00:00Z")).toISOString()).toBe(
      "2026-07-20T20:00:00.000Z", // Mon 2026-07-20 4:00pm ET
    );
  });

  it("rolls a weekend instant to the following Monday's close", () => {
    // Sat 2026-07-18 noon ET
    expect(nextMarketClose(new Date("2026-07-18T16:00:00Z")).toISOString()).toBe(
      "2026-07-20T20:00:00.000Z", // Mon 2026-07-20 4:00pm ET
    );
  });
});
