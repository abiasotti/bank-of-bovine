"use server";

import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

// redirectTo lets both the Watchlist page (add via a <select> form) and the
// Lookup detail page (a single-symbol star toggle) share this action -
// each redirects back to wherever it was called from.
export async function addToWatchlistAction(formData: FormData) {
  const user = await requireCurrentUser();
  if (!user.account) {
    throw new Error("Account not fully provisioned");
  }

  const symbol = String(formData.get("symbol") ?? "").toUpperCase();
  const redirectTo = String(formData.get("redirectTo") ?? "/watchlist");

  const security = await prisma.security.findUnique({ where: { symbol } });
  if (!security) {
    redirect(`${redirectTo}?error=Unknown+symbol`);
  }

  const watchlist = await prisma.watchlist.findUniqueOrThrow({
    where: { accountId: user.account.id },
  });

  await prisma.watchlistItem.upsert({
    where: {
      watchlistId_securityId: {
        watchlistId: watchlist.id,
        securityId: security.id,
      },
    },
    update: {},
    create: { watchlistId: watchlist.id, securityId: security.id },
  });

  redirect(redirectTo);
}

// Bound as `.bind(null, symbol, redirectTo)` at call sites - the trailing
// FormData React passes to a form action is accepted but unused.
export async function removeFromWatchlistAction(
  symbol: string,
  redirectTo: string = "/watchlist",
) {
  const user = await requireCurrentUser();
  if (!user.account) {
    throw new Error("Account not fully provisioned");
  }

  const security = await prisma.security.findUnique({ where: { symbol } });
  if (!security) {
    redirect(redirectTo);
  }

  const watchlist = await prisma.watchlist.findUniqueOrThrow({
    where: { accountId: user.account.id },
  });

  await prisma.watchlistItem.deleteMany({
    where: { watchlistId: watchlist.id, securityId: security.id },
  });

  redirect(redirectTo);
}
