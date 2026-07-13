import Decimal from "decimal.js";

// Matches the NUMERIC(18,4) / NUMERIC(18,6) columns used for money and share
// quantities respectively (see prisma/schema.prisma). Keeping these in sync
// with the schema avoids silent precision loss between DB and app layers.
export const MONEY_DECIMAL_PLACES = 4;
export const SHARE_DECIMAL_PLACES = 6;
export const MONEY_DISPLAY_DECIMAL_PLACES = 2;

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export function toMoney(value: Decimal.Value): Decimal {
  return new Decimal(value).toDecimalPlaces(
    MONEY_DECIMAL_PLACES,
    Decimal.ROUND_HALF_UP,
  );
}

export function toShareQuantity(value: Decimal.Value): Decimal {
  return new Decimal(value).toDecimalPlaces(
    SHARE_DECIMAL_PLACES,
    Decimal.ROUND_HALF_UP,
  );
}

export function isPositive(value: Decimal.Value): boolean {
  return new Decimal(value).greaterThan(0);
}

export function sumDecimals(values: Decimal.Value[]): Decimal {
  return values.reduce(
    (total: Decimal, value) => total.plus(value),
    new Decimal(0),
  );
}

export function formatCurrency(value: Decimal.Value): string {
  const amount = new Decimal(value).toDecimalPlaces(
    MONEY_DISPLAY_DECIMAL_PLACES,
    Decimal.ROUND_HALF_UP,
  );
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount.toNumber());
  return formatted;
}

export function formatShares(value: Decimal.Value): string {
  const shares = new Decimal(value);
  // Whole-share quantities render without decimals; fractional shares keep
  // enough precision to be meaningful without spilling to 6 places.
  return shares.isInteger()
    ? shares.toFixed(0)
    : shares.toDecimalPlaces(4, Decimal.ROUND_DOWN).toFixed();
}

export function formatPercent(value: Decimal.Value): string {
  const percent = new Decimal(value).times(100).toDecimalPlaces(2);
  const sign = percent.greaterThanOrEqualTo(0) ? "+" : "";
  return `${sign}${percent.toFixed(2)}%`;
}

export class InvalidDecimalInputError extends Error {
  constructor(input: string) {
    super(`Invalid decimal input: ${input}`);
    this.name = "InvalidDecimalInputError";
  }
}

// Parses untrusted user input (form fields) into a Decimal, rejecting
// anything that isn't a finite non-negative decimal string.
export function parseDecimalInput(input: string): Decimal {
  const trimmed = input.trim();
  if (trimmed === "" || !/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new InvalidDecimalInputError(input);
  }
  return new Decimal(trimmed);
}
