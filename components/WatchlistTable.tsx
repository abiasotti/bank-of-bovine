"use client";

import { formatCurrency } from "@/lib/money";
import { useLiveQuotes } from "@/lib/hooks/useLiveQuotes";

export interface WatchlistItemView {
  id: string;
  symbol: string;
  name: string;
  price: string | null;
}

export function WatchlistTable({
  items,
  removeAction,
}: {
  items: WatchlistItemView[];
  removeAction: (symbol: string) => void | Promise<void>;
}) {
  const liveQuotes = useLiveQuotes(items.map((item) => item.symbol));

  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-600">
        Your watchlist is empty. Add a symbol below.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-gray-600">
          <th className="py-1">Symbol</th>
          <th className="py-1">Name</th>
          <th className="py-1 text-right">Last price</th>
          <th className="py-1"></th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const price = liveQuotes[item.symbol]?.price ?? item.price;
          return (
            <tr key={item.id} className="border-b last:border-0">
              <td className="py-1">{item.symbol}</td>
              <td className="py-1">{item.name}</td>
              <td className="py-1 text-right">
                {price ? formatCurrency(price) : "—"}
              </td>
              <td className="py-1">
                <form action={removeAction.bind(null, item.symbol)}>
                  <button type="submit" className="text-red-600 underline">
                    Remove
                  </button>
                </form>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
