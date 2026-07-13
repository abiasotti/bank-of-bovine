import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

const bodySchema = z.object({ symbol: z.string() });

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.account) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const watchlist = await prisma.watchlist.findUnique({
    where: { accountId: user.account.id },
    include: { items: { include: { security: true } } },
  });
  return NextResponse.json({ items: watchlist?.items ?? [] });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.account) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const security = await prisma.security.findUnique({
    where: { symbol: parsed.data.symbol.toUpperCase() },
  });
  if (!security) {
    return NextResponse.json({ error: "unknown_symbol" }, { status: 400 });
  }

  const watchlist = await prisma.watchlist.findUniqueOrThrow({
    where: { accountId: user.account.id },
  });

  const item = await prisma.watchlistItem.upsert({
    where: {
      watchlistId_securityId: {
        watchlistId: watchlist.id,
        securityId: security.id,
      },
    },
    update: {},
    create: { watchlistId: watchlist.id, securityId: security.id },
  });
  return NextResponse.json({ item }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user?.account) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const security = await prisma.security.findUnique({
    where: { symbol: parsed.data.symbol.toUpperCase() },
  });
  if (!security) {
    return NextResponse.json({ error: "unknown_symbol" }, { status: 400 });
  }

  const watchlist = await prisma.watchlist.findUniqueOrThrow({
    where: { accountId: user.account.id },
  });

  await prisma.watchlistItem.deleteMany({
    where: { watchlistId: watchlist.id, securityId: security.id },
  });
  return NextResponse.json({ ok: true });
}
