"use client";

import Link from "next/link";
import { Decimal, formatCurrency, formatPercent, formatShares } from "@/lib/money";
import { useLiveQuotes } from "@/lib/hooks/useLiveQuotes";

export interface HoldingView {
  securityId: string;
  symbol: string;
  openQuantity: string;
  averageCostBasisPerShare: string;
  price: string | null;
}

// Live-recomputes market value, unrealized G/L, and the portfolio-wide
// totals as quotes tick in - so the summary header and the per-row numbers
// never drift out of sync with each other. Day change is left as the
// server-computed snapshot (updates on next page load): recomputing it
// live would mean also streaming each holding's start-of-day reference
// price, which isn't worth the complexity for a number that's inherently
// "since this morning," not "right now."
export function LivePortfolioView({
  cashBalance,
  netDeposits,
  realizedGainLoss,
  dayChange,
  holdings,
}: {
  cashBalance: string;
  netDeposits: string;
  realizedGainLoss: string;
  dayChange: string;
  holdings: HoldingView[];
}) {
  const liveQuotes = useLiveQuotes(holdings.map((h) => h.symbol));

  const computed = holdings.map((holding) => {
    const livePrice = liveQuotes[holding.symbol]?.price ?? holding.price;
    const priceDecimal = livePrice ? new Decimal(livePrice) : null;
    const openQuantity = new Decimal(holding.openQuantity);
    const averageCostBasisPerShare = new Decimal(
      holding.averageCostBasisPerShare,
    );
    const marketValue = priceDecimal
      ? openQuantity.times(priceDecimal)
      : new Decimal(0);
    const costBasis = openQuantity.times(averageCostBasisPerShare);
    const unrealizedGainLoss = priceDecimal
      ? marketValue.minus(costBasis)
      : new Decimal(0);
    return {
      ...holding,
      openQuantity,
      averageCostBasisPerShare,
      priceDecimal,
      marketValue,
      unrealizedGainLoss,
    };
  });

  const totalMarketValue = computed.reduce(
    (sum, h) => sum.plus(h.marketValue),
    new Decimal(0),
  );
  const cashDecimal = new Decimal(cashBalance);
  const totalPortfolioValue = cashDecimal.plus(totalMarketValue);
  const totalUnrealizedGainLoss = computed.reduce(
    (sum, h) => sum.plus(h.unrealizedGainLoss),
    new Decimal(0),
  );
  const netDepositsDecimal = new Decimal(netDeposits);
  const totalReturnPct = !netDepositsDecimal.isZero()
    ? totalPortfolioValue.minus(netDepositsDecimal).div(netDepositsDecimal)
    : null;
  const dayChangeDecimal = new Decimal(dayChange);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="mt-2 text-3xl font-bold">
          {formatCurrency(totalPortfolioValue)}
        </p>
        <div className="mt-2 flex flex-wrap gap-6 text-sm text-gray-600">
          <span>Cash: {formatCurrency(cashDecimal)}</span>
          <span>Holdings: {formatCurrency(totalMarketValue)}</span>
          <span
            className={
              dayChangeDecimal.isNegative() ? "text-red-600" : "text-green-600"
            }
          >
            Day change: {formatCurrency(dayChangeDecimal)}
          </span>
          {totalReturnPct !== null && (
            <span
              className={
                totalReturnPct.isNegative() ? "text-red-600" : "text-green-600"
              }
            >
              Total return: {formatPercent(totalReturnPct)}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-6 text-sm text-gray-600">
          <span>
            Unrealized G/L: {formatCurrency(totalUnrealizedGainLoss)}
          </span>
          <span>Realized G/L: {formatCurrency(realizedGainLoss)}</span>
        </div>
      </div>

      {computed.length === 0 ? (
        <p className="text-sm text-gray-600">
          No open positions yet. Place an order to get started.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="py-1">Symbol</th>
              <th className="py-1 text-right">Qty</th>
              <th className="py-1 text-right">Avg cost</th>
              <th className="py-1 text-right">Last price</th>
              <th className="py-1 text-right">Market value</th>
              <th className="py-1 text-right">Unrealized G/L</th>
            </tr>
          </thead>
          <tbody>
            {computed.map((holding) => (
              <tr key={holding.securityId} className="border-b last:border-0">
                <td className="py-1">
                  <Link
                    href={`/lookup/${holding.symbol}`}
                    className="underline"
                  >
                    {holding.symbol}
                  </Link>
                </td>
                <td className="py-1 text-right">
                  {formatShares(holding.openQuantity)}
                </td>
                <td className="py-1 text-right">
                  {formatCurrency(holding.averageCostBasisPerShare)}
                </td>
                <td className="py-1 text-right">
                  {holding.priceDecimal
                    ? formatCurrency(holding.priceDecimal)
                    : "—"}
                </td>
                <td className="py-1 text-right">
                  {formatCurrency(holding.marketValue)}
                </td>
                <td
                  className={`py-1 text-right ${
                    holding.unrealizedGainLoss.isNegative()
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  {formatCurrency(holding.unrealizedGainLoss)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
