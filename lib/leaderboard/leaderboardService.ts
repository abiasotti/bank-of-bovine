import { prisma } from "@/lib/db/client";
import { getPortfolioSummary } from "@/lib/portfolio/portfolioService";
import type { Decimal } from "@/lib/money";

// Only display_name + the performance metric are exposed here - never
// holdings, orders, or transfer history from other users (data isolation
// requirement in brokerage-sim-spec.md "Multi-User / Social").
export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  totalReturnPct: Decimal | null;
}

// Ranked by total return % (current value vs. net deposits), not raw dollar
// totals - otherwise depositing more fake cash would outrank actual trading
// skill. Accounts with no deposits yet (nothing to compute a return
// against) rank last rather than being excluded.
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const accounts = await prisma.account.findMany({ include: { user: true } });

  const entries = await Promise.all(
    accounts.map(async (account) => {
      const summary = await getPortfolioSummary(account.id);
      return {
        displayName: account.user.displayName,
        totalReturnPct: summary.totalReturnPct,
      };
    }),
  );

  const ranked = entries
    .filter(
      (entry): entry is { displayName: string; totalReturnPct: Decimal } =>
        entry.totalReturnPct !== null,
    )
    .sort((a, b) => b.totalReturnPct.comparedTo(a.totalReturnPct));
  const unranked = entries.filter((entry) => entry.totalReturnPct === null);

  return [...ranked, ...unranked].map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}
