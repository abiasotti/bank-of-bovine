import { prisma } from "@/lib/db/client";
import { Decimal, toMoney } from "@/lib/money";
import { getAccountBalance } from "@/lib/ledger/getAccountBalance";
import { getLatestQuoteBySecurityId } from "@/lib/quotes/quoteService";

export interface HoldingSummary {
  securityId: string;
  symbol: string;
  name: string;
  openQuantity: Decimal;
  averageCostBasisPerShare: Decimal;
  latestPrice: Decimal | null;
  marketValue: Decimal;
  unrealizedGainLoss: Decimal;
}

export interface PortfolioSummary {
  cashBalance: Decimal;
  holdings: HoldingSummary[];
  totalMarketValue: Decimal;
  totalPortfolioValue: Decimal;
  totalRealizedGainLoss: Decimal;
  totalUnrealizedGainLoss: Decimal;
  netDeposits: Decimal;
  // null when netDeposits is 0 - there's nothing to compute a return against
  // yet (a brand-new, unfunded account).
  totalReturnPct: Decimal | null;
  dayChange: Decimal;
}

function startOfUtcDay(): Date {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export async function getPortfolioSummary(
  accountId: string,
): Promise<PortfolioSummary> {
  const cashBalance = await getAccountBalance(accountId);

  const openLots = await prisma.taxLot.findMany({
    where: { accountId, openQuantity: { gt: 0 } },
    include: { security: true },
  });

  const lotsBySecurity = new Map<string, typeof openLots>();
  for (const lot of openLots) {
    const existing = lotsBySecurity.get(lot.securityId);
    if (existing) existing.push(lot);
    else lotsBySecurity.set(lot.securityId, [lot]);
  }

  const startOfDay = startOfUtcDay();
  const holdings: HoldingSummary[] = [];
  let totalMarketValue = new Decimal(0);
  let totalUnrealizedGainLoss = new Decimal(0);
  let dayChange = new Decimal(0);

  for (const [securityId, lots] of lotsBySecurity) {
    const security = lots[0].security;
    const openQuantity = lots.reduce(
      (sum, lot) => sum.plus(lot.openQuantity),
      new Decimal(0),
    );
    const totalCostBasis = lots.reduce(
      (sum, lot) =>
        sum.plus(new Decimal(lot.openQuantity).times(lot.costBasisPerShare)),
      new Decimal(0),
    );
    const averageCostBasisPerShare = openQuantity.isZero()
      ? new Decimal(0)
      : toMoney(totalCostBasis.div(openQuantity));

    const latestQuote = await getLatestQuoteBySecurityId(securityId);
    const latestPrice = latestQuote ? new Decimal(latestQuote.price) : null;
    const marketValue = latestPrice
      ? toMoney(openQuantity.times(latestPrice))
      : new Decimal(0);
    const unrealizedGainLoss = latestPrice
      ? toMoney(marketValue.minus(totalCostBasis))
      : new Decimal(0);

    const firstQuoteToday = await prisma.quote.findFirst({
      where: { securityId, asOf: { gte: startOfDay } },
      orderBy: { asOf: "asc" },
    });
    const referencePrice = firstQuoteToday
      ? new Decimal(firstQuoteToday.price)
      : latestPrice;
    const securityDayChange =
      latestPrice && referencePrice
        ? toMoney(openQuantity.times(latestPrice.minus(referencePrice)))
        : new Decimal(0);

    holdings.push({
      securityId,
      symbol: security.symbol,
      name: security.name,
      openQuantity,
      averageCostBasisPerShare,
      latestPrice,
      marketValue,
      unrealizedGainLoss,
    });

    totalMarketValue = totalMarketValue.plus(marketValue);
    totalUnrealizedGainLoss = totalUnrealizedGainLoss.plus(
      unrealizedGainLoss,
    );
    dayChange = dayChange.plus(securityDayChange);
  }

  holdings.sort((a, b) => a.symbol.localeCompare(b.symbol));

  const realizedResult = await prisma.execution.aggregate({
    where: { accountId, side: "sell" },
    _sum: { realizedGainLoss: true },
  });
  const totalRealizedGainLoss = new Decimal(
    realizedResult._sum.realizedGainLoss ?? 0,
  );

  const depositsResult = await prisma.ledgerEntry.aggregate({
    where: { accountId, entryType: "transfer_in" },
    _sum: { amount: true },
  });
  const netDeposits = new Decimal(depositsResult._sum.amount ?? 0);

  const totalPortfolioValue = toMoney(cashBalance.plus(totalMarketValue));
  const totalReturnPct = netDeposits.isZero()
    ? null
    : totalPortfolioValue.minus(netDeposits).div(netDeposits);

  return {
    cashBalance,
    holdings,
    totalMarketValue: toMoney(totalMarketValue),
    totalPortfolioValue,
    totalRealizedGainLoss: toMoney(totalRealizedGainLoss),
    totalUnrealizedGainLoss: toMoney(totalUnrealizedGainLoss),
    netDeposits,
    totalReturnPct,
    dayChange: toMoney(dayChange),
  };
}
