import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getLatestQuoteBySecurityId } from "@/lib/quotes/quoteService";
import {
  addToWatchlistAction,
  removeFromWatchlistAction,
} from "@/lib/watchlist/actions";
import { WatchlistTable } from "@/components/WatchlistTable";

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireCurrentUser();
  if (!user.account) {
    throw new Error("Account not fully provisioned");
  }

  const watchlist = await prisma.watchlist.findUnique({
    where: { accountId: user.account.id },
    include: { items: { include: { security: true } } },
  });
  const items = watchlist?.items ?? [];

  const itemViews = await Promise.all(
    items.map(async (item) => {
      const latestQuote = await getLatestQuoteBySecurityId(item.securityId);
      return {
        id: item.id,
        symbol: item.security.symbol,
        name: item.security.name,
        price: latestQuote?.price.toString() ?? null,
      };
    }),
  );

  const watchedSecurityIds = new Set(items.map((item) => item.securityId));
  const availableSecurities = await prisma.security.findMany({
    where: { isActive: true, id: { notIn: [...watchedSecurityIds] } },
    orderBy: { symbol: "asc" },
  });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Watchlist</h1>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <WatchlistTable items={itemViews} removeAction={removeFromWatchlistAction} />
      {availableSecurities.length > 0 && (
        <form
          action={addToWatchlistAction}
          className="flex max-w-sm items-end gap-3"
        >
          <input type="hidden" name="redirectTo" value="/watchlist" />
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Add a symbol
            <select
              name="symbol"
              required
              className="rounded border px-3 py-2"
            >
              {availableSecurities.map((security) => (
                <option key={security.id} value={security.symbol}>
                  {security.symbol} &mdash; {security.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded bg-black px-4 py-2 text-sm text-white"
          >
            Add
          </button>
        </form>
      )}
    </div>
  );
}
