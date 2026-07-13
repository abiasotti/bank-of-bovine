const MARKET_TIME_ZONE = "America/New_York";
const MARKET_OPEN_MINUTES = 9 * 60 + 30; // 9:30 AM
const MARKET_CLOSE_MINUTES = 16 * 60; // 4:00 PM

export const MARKET_HOURS_DESCRIPTION = "9:30 AM–4:00 PM ET, Monday–Friday";

const WEEKEND_DAYS = new Set(["Sat", "Sun"]);

// NYSE regular trading hours only - no holiday calendar for now (New
// Year's, Thanksgiving, etc. are treated as open days). Uses Intl's IANA
// tz data instead of a date library so DST transitions are handled for
// free.
export function isMarketOpen(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value;

  if (WEEKEND_DAYS.has(get("weekday")!)) return false;

  const minutesSinceMidnight = Number(get("hour")) * 60 + Number(get("minute"));
  return (
    minutesSinceMidnight >= MARKET_OPEN_MINUTES &&
    minutesSinceMidnight < MARKET_CLOSE_MINUTES
  );
}
