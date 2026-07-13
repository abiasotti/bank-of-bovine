"use client";

import { Decimal, formatCurrency } from "@/lib/money";
import { useLiveQuotes } from "@/lib/hooks/useLiveQuotes";

// Live price + change badge for one symbol. previousClose isn't part of the
// live SSE payload (only price/asOf) since it only changes once a day at
// market open, not on every tick - the change badge stays accurate
// computing against the previousClose captured at page load.
export function LiveQuoteView({
  symbol,
  initialPrice,
  initialAsOf,
  previousClose,
}: {
  symbol: string;
  initialPrice: string | null;
  initialAsOf: string | null;
  previousClose: string | null;
}) {
  const liveQuotes = useLiveQuotes([symbol]);
  const live = liveQuotes[symbol];

  const price = live?.price ?? initialPrice;
  const priceDecimal = price ? new Decimal(price) : null;
  const previousCloseDecimal = previousClose ? new Decimal(previousClose) : null;
  const change =
    priceDecimal && previousCloseDecimal
      ? priceDecimal.minus(previousCloseDecimal)
      : null;
  const changePct =
    change && previousCloseDecimal && !previousCloseDecimal.isZero()
      ? change.div(previousCloseDecimal).times(100)
      : null;
  const isUp = change ? !change.isNegative() : true;

  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="text-4xl font-bold">
          {priceDecimal ? formatCurrency(priceDecimal) : "No quotes yet"}
        </span>
        {change && changePct && (
          <span
            className={`text-lg font-medium ${
              isUp ? "text-green-600" : "text-red-600"
            }`}
          >
            {isUp ? "+" : ""}
            {formatCurrency(change)} ({isUp ? "+" : ""}
            {changePct.toFixed(2)}%)
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-500">
        {live
          ? `Live as of ${new Date(live.asOf).toLocaleString()}`
          : initialAsOf
            ? `As of ${new Date(initialAsOf).toLocaleString()}`
            : ""}
      </p>
    </div>
  );
}
