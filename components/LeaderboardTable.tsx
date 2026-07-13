import { formatPercent } from "@/lib/money";
import type { LeaderboardEntry } from "@/lib/leaderboard/leaderboardService";

export function LeaderboardTable({
  entries,
}: {
  entries: LeaderboardEntry[];
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-600">No participants yet.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-gray-600">
          <th className="py-1">Rank</th>
          <th className="py-1">Name</th>
          <th className="py-1 text-right">Total return</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.rank} className="border-b last:border-0">
            <td className="py-1">{entry.rank}</td>
            <td className="py-1">{entry.displayName}</td>
            <td className="py-1 text-right">
              {entry.totalReturnPct !== null
                ? formatPercent(entry.totalReturnPct)
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
