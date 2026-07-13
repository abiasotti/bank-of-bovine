import { requireCurrentUser } from "@/lib/auth/session";
import { getPortfolioSummary } from "@/lib/portfolio/portfolioService";
import { LivePortfolioView } from "@/components/LivePortfolioView";

export default async function PortfolioPage() {
  const user = await requireCurrentUser();
  if (!user.account) {
    throw new Error("Account not fully provisioned");
  }

  const summary = await getPortfolioSummary(user.account.id);

  return (
    <div>
      <h1 className="text-xl font-semibold">Portfolio</h1>
      <LivePortfolioView
        cashBalance={summary.cashBalance.toString()}
        netDeposits={summary.netDeposits.toString()}
        realizedGainLoss={summary.totalRealizedGainLoss.toString()}
        dayChange={summary.dayChange.toString()}
        holdings={summary.holdings.map((holding) => ({
          securityId: holding.securityId,
          symbol: holding.symbol,
          openQuantity: holding.openQuantity.toString(),
          averageCostBasisPerShare: holding.averageCostBasisPerShare.toString(),
          price: holding.latestPrice ? holding.latestPrice.toString() : null,
        }))}
      />
    </div>
  );
}
