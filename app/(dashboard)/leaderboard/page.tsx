import { getLeaderboard } from "@/lib/leaderboard/leaderboardService";
import { LeaderboardTable } from "@/components/LeaderboardTable";

export default async function LeaderboardPage() {
  const entries = await getLeaderboard();

  return (
    <div>
      <h1 className="text-xl font-semibold">Leaderboard</h1>
      <p className="mt-1 text-sm text-gray-600">
        Ranked by total return since funding.
      </p>
      <div className="mt-4">
        <LeaderboardTable entries={entries} />
      </div>
    </div>
  );
}
