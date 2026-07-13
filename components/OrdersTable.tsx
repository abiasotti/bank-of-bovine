import type { Order, Security } from "@/lib/generated/prisma/client";
import { formatShares, formatCurrency } from "@/lib/money";

type OrderWithSecurity = Order & { security: Security };

export function OrdersTable({
  orders,
  cancelAction,
}: {
  orders: OrderWithSecurity[];
  cancelAction: (orderId: string) => void | Promise<void>;
}) {
  if (orders.length === 0) {
    return <p className="text-sm text-gray-600">No orders yet.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-gray-600">
          <th className="py-1">Symbol</th>
          <th className="py-1">Side</th>
          <th className="py-1">Type</th>
          <th className="py-1">TIF</th>
          <th className="py-1 text-right">Qty</th>
          <th className="py-1 text-right">Limit</th>
          <th className="py-1 text-right">Stop</th>
          <th className="py-1">Status</th>
          <th className="py-1">Submitted</th>
          <th className="py-1"></th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.id} className="border-b last:border-0">
            <td className="py-1">{order.security.symbol}</td>
            <td className="py-1 capitalize">{order.side}</td>
            <td className="py-1 capitalize">{order.orderType}</td>
            <td className="py-1 uppercase">{order.timeInForce}</td>
            <td className="py-1 text-right">
              {formatShares(order.quantity)}
            </td>
            <td className="py-1 text-right">
              {order.limitPrice ? formatCurrency(order.limitPrice) : "—"}
            </td>
            <td className="py-1 text-right">
              {order.stopPrice ? formatCurrency(order.stopPrice) : "—"}
            </td>
            <td className="py-1 capitalize">{order.status}</td>
            <td className="py-1">{order.submittedAt.toLocaleString()}</td>
            <td className="py-1">
              {order.status === "pending" && (
                <form action={cancelAction.bind(null, order.id)}>
                  <button type="submit" className="text-red-600 underline">
                    Cancel
                  </button>
                </form>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
