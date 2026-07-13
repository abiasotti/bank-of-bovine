import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/session";
import { Decimal, formatCurrency } from "@/lib/money";
import { getQuoteProviderKind } from "@/lib/quotes/quoteService";
import { getAccountBalance } from "@/lib/ledger/getAccountBalance";
import { TradeModal } from "@/components/TradeModal";
import { LiveQuoteView } from "@/components/LiveQuoteView";
import { LiveChart } from "@/components/LiveChart";
import {
  findOrCreateSecurity,
  InvalidSymbolError,
} from "@/lib/securities/securityService";
import {
  addToWatchlistAction,
  removeFromWatchlistAction,
} from "@/lib/watchlist/actions";

export default async function LookupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ name?: string }>;
}) {
  const { symbol } = await params;
  const { name } = await searchParams;

  const user = await requireCurrentUser();
  if (!user.account) {
    throw new Error("Account not fully provisioned");
  }

  let security;
  try {
    security = await findOrCreateSecurity(symbol, name);
  } catch (error) {
    if (error instanceof InvalidSymbolError) {
      return (
        <div>
          <h1 className="text-xl font-semibold">
            &ldquo;{symbol.toUpperCase()}&rdquo; not found
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            That doesn&apos;t look like a symbol we or the market recognize.
          </p>
          <Link href="/lookup" className="mt-4 inline-block underline">
            Back to Lookup
          </Link>
        </div>
      );
    }
    throw error;
  }

  const quotesDesc = await prisma.quote.findMany({
    where: { securityId: security.id },
    orderBy: { asOf: "desc" },
    take: 200,
  });
  const quotesAsc = [...quotesDesc].reverse();
  const latest = quotesDesc[0] ?? null;

  const providerKind = getQuoteProviderKind();
  const [openLots, watchlist, cashBalance] = await Promise.all([
    prisma.taxLot.findMany({
      where: {
        accountId: user.account.id,
        securityId: security.id,
        openQuantity: { gt: 0 },
      },
      orderBy: { acquiredAt: "asc" },
    }),
    prisma.watchlist.findUniqueOrThrow({
      where: { accountId: user.account.id },
      include: {
        items: { where: { securityId: security.id }, select: { id: true } },
      },
    }),
    getAccountBalance(user.account.id),
  ]);
  const isWatched = watchlist.items.length > 0;
  const redirectTo = `/lookup/${security.symbol}`;

  // Prefer the provider's own OHLC values (real, and free with every
  // Finnhub quote) - fall back to computing from our own accumulated
  // history for the mock provider or a symbol's very first quote.
  const previousClose = latest?.previousClose
    ? new Decimal(latest.previousClose)
    : quotesAsc.length > 1
      ? new Decimal(quotesAsc[0].price)
      : null;
  const dayOpen = latest?.dayOpen
    ? new Decimal(latest.dayOpen)
    : quotesAsc.length > 0
      ? new Decimal(quotesAsc[0].price)
      : null;
  const dayHigh = latest?.dayHigh
    ? new Decimal(latest.dayHigh)
    : quotesAsc.length > 0
      ? Decimal.max(...quotesAsc.map((q) => new Decimal(q.price)))
      : null;
  const dayLow = latest?.dayLow
    ? new Decimal(latest.dayLow)
    : quotesAsc.length > 0
      ? Decimal.min(...quotesAsc.map((q) => new Decimal(q.price)))
      : null;

  const price = latest ? new Decimal(latest.price) : null;

  return (
    <div className="max-w-3xl">
      <p className="text-xs text-gray-500">
        {providerKind === "finnhub"
          ? `${security.exchange} • USD • Real-time (simulated brokerage)`
          : "SIMULATED • Not real market data"}
      </p>

      <div className="mt-1 flex items-center gap-2">
        <h1 className="text-2xl font-bold">
          {security.name} ({security.symbol})
        </h1>
        <form action={addToWatchlistAction}>
          <input type="hidden" name="symbol" value={security.symbol} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          {!isWatched && (
            <button
              type="submit"
              aria-label="Add to watchlist"
              className="text-xl text-gray-400 hover:text-amber-500"
            >
              ☆
            </button>
          )}
        </form>
        {isWatched && (
          <form
            action={removeFromWatchlistAction.bind(
              null,
              security.symbol,
              redirectTo,
            )}
          >
            <button
              type="submit"
              aria-label="Remove from watchlist"
              className="text-xl text-amber-500"
            >
              ★
            </button>
          </form>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between">
        <LiveQuoteView
          symbol={security.symbol}
          initialPrice={price?.toString() ?? null}
          initialAsOf={latest?.asOf.toISOString() ?? null}
          previousClose={previousClose?.toString() ?? null}
        />
        <div className="flex gap-3">
          <TradeModal
            symbol={security.symbol}
            side="buy"
            latestPrice={price?.toString() ?? null}
            availableCash={cashBalance.toString()}
          />
          <TradeModal
            symbol={security.symbol}
            side="sell"
            latestPrice={price?.toString() ?? null}
            openLots={openLots.map((lot) => ({
              id: lot.id,
              openQuantity: lot.openQuantity.toString(),
              costBasisPerShare: lot.costBasisPerShare.toString(),
              acquiredAt: lot.acquiredAt.toISOString(),
            }))}
          />
        </div>
      </div>

      <div className="mt-6 rounded border p-4">
        <LiveChart
          symbol={security.symbol}
          initialPoints={quotesAsc.map((q) => ({
            asOf: q.asOf.toISOString(),
            price: Number(q.price),
          }))}
        />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        <div className="flex justify-between border-b pb-1">
          <dt className="text-gray-500">Previous Close</dt>
          <dd>{previousClose ? formatCurrency(previousClose) : "—"}</dd>
        </div>
        <div className="flex justify-between border-b pb-1">
          <dt className="text-gray-500">Open</dt>
          <dd>{dayOpen ? formatCurrency(dayOpen) : "—"}</dd>
        </div>
        <div className="flex justify-between border-b pb-1">
          <dt className="text-gray-500">Day&apos;s Range</dt>
          <dd>
            {dayLow && dayHigh
              ? `${formatCurrency(dayLow)} - ${formatCurrency(dayHigh)}`
              : "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
