import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { formatCurrency } from "@/lib/money";
import { searchSecurities } from "@/lib/securities/securityService";

export default async function LookupPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const results = query ? await searchSecurities(query) : null;

  // A single unambiguous match - skip straight to it instead of making the
  // user click through a one-item list.
  if (results) {
    const totalMatches = results.known.length + results.discoverable.length;
    if (totalMatches === 1) {
      if (results.known.length === 1) {
        redirect(`/lookup/${results.known[0].symbol}`);
      }
      const only = results.discoverable[0];
      redirect(`/lookup/${only.symbol}?name=${encodeURIComponent(only.name)}`);
    }
  }

  const securities = query
    ? []
    : await prisma.security.findMany({
        where: { isActive: true },
        orderBy: { symbol: "asc" },
        include: { quotes: { orderBy: { asOf: "desc" }, take: 1 } },
      });

  return (
    <div>
      <h1 className="text-xl font-semibold">Lookup</h1>
      <p className="mt-1 text-sm text-gray-600">
        Search any real ticker or company name, or browse what you&apos;ve
        looked up before. Then buy or sell.
      </p>

      <form action="/lookup" className="mt-4 flex max-w-md gap-2">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Symbol or company name (e.g. AAPL, Apple)"
          className="flex-1 rounded border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-sm text-white"
        >
          Search
        </button>
      </form>

      {results && (
        <div className="mt-6 flex flex-col gap-8">
          {results.known.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-600">
                Already tracked
              </h2>
              <ul className="mt-2 flex flex-col gap-1">
                {results.known.map((security) => (
                  <li key={security.id}>
                    <Link
                      href={`/lookup/${security.symbol}`}
                      className="underline"
                    >
                      {security.symbol}
                    </Link>{" "}
                    <span className="text-sm text-gray-600">
                      {security.name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {results.discoverable.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-600">
                Full market
              </h2>
              <ul className="mt-2 flex flex-col gap-1">
                {results.discoverable.map((result) => (
                  <li key={result.symbol}>
                    <Link
                      href={`/lookup/${result.symbol}?name=${encodeURIComponent(result.name)}`}
                      className="underline"
                    >
                      {result.symbol}
                    </Link>{" "}
                    <span className="text-sm text-gray-600">
                      {result.name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {results.known.length === 0 && results.discoverable.length === 0 && (
            <p className="text-sm text-gray-600">
              No matches for &ldquo;{query}&rdquo;.
            </p>
          )}
        </div>
      )}

      {!query && (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="py-1">Symbol</th>
              <th className="py-1">Name</th>
              <th className="py-1 text-right">Last price</th>
            </tr>
          </thead>
          <tbody>
            {securities.map((security) => (
              <tr key={security.id} className="border-b last:border-0">
                <td className="py-1">
                  <Link
                    href={`/lookup/${security.symbol}`}
                    className="underline"
                  >
                    {security.symbol}
                  </Link>
                </td>
                <td className="py-1">{security.name}</td>
                <td className="py-1 text-right">
                  {security.quotes[0]
                    ? formatCurrency(security.quotes[0].price)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
