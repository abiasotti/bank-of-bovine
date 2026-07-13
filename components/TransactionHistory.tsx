import type { Transfer } from "@/lib/generated/prisma/client";
import { formatCurrency } from "@/lib/money";

export function TransactionHistory({ transfers }: { transfers: Transfer[] }) {
  if (transfers.length === 0) {
    return (
      <p className="text-sm text-gray-600">
        No transfers yet. Fund your account above to get started.
      </p>
    );
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold">Transfer history</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-600">
            <th className="py-1">Date</th>
            <th className="py-1">Direction</th>
            <th className="py-1 text-right">Amount</th>
            <th className="py-1">Status</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((transfer) => (
            <tr key={transfer.id} className="border-b last:border-0">
              <td className="py-1">
                {transfer.createdAt.toLocaleString()}
              </td>
              <td className="py-1 capitalize">{transfer.direction}</td>
              <td className="py-1 text-right">
                {formatCurrency(transfer.amount)}
              </td>
              <td className="py-1 capitalize">{transfer.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
