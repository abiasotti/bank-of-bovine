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

interface EtDateParts {
  year: number;
  month: number;
  day: number;
  weekday: string;
}

function getEtDateParts(date: Date): EtDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)!.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"),
  };
}

// The UTC offset (in minutes) America/New_York is at for whatever instant
// falls on the same side of any DST transition as `utcGuess` - used to
// convert an ET wall-clock time back into a real UTC instant without
// pulling in a date library.
function etOffsetMinutes(utcGuess: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(utcGuess);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const match = /GMT([+-]\d+)/.exec(raw);
  return match ? Number(match[1]) * 60 : -300;
}

function marketCloseInstantForEtDate(parts: EtDateParts): Date {
  const utcGuess = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, MARKET_CLOSE_MINUTES / 60, 0, 0),
  );
  return new Date(utcGuess.getTime() - etOffsetMinutes(utcGuess) * 60000);
}

// The close (4:00pm ET) of the trading session `now` belongs to: today's
// close if `now` is on a weekday before that close, otherwise the next
// weekday's close. Used for "day" order expiration - a day order placed
// after-hours (or over the weekend) should expire at the end of the
// session it'll actually be evaluated in, not at midnight the day it was
// submitted.
export function nextMarketClose(now: Date): Date {
  let etParts = getEtDateParts(now);
  let close = marketCloseInstantForEtDate(etParts);
  while (WEEKEND_DAYS.has(etParts.weekday) || now.getTime() >= close.getTime()) {
    const nextDayInstant = new Date(close.getTime() + 24 * 60 * 60 * 1000);
    etParts = getEtDateParts(nextDayInstant);
    close = marketCloseInstantForEtDate(etParts);
  }
  return close;
}
