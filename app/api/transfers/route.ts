import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import {
  createTransfer,
  InvalidTransferAmountError,
} from "@/lib/ledger/transferService";
import { parseDecimalInput, InvalidDecimalInputError } from "@/lib/money";

const bodySchema = z.object({
  amount: z.string(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.account || !user.externalBankAccount) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const amount = parseDecimalInput(parsed.data.amount);
    const transfer = await createTransfer({
      accountId: user.account.id,
      externalBankAccountId: user.externalBankAccount.id,
      amount,
    });
    return NextResponse.json({ transfer }, { status: 201 });
  } catch (error) {
    if (
      error instanceof InvalidDecimalInputError ||
      error instanceof InvalidTransferAmountError
    ) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
    }
    throw error;
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.account) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const transfers = await prisma.transfer.findMany({
    where: { accountId: user.account.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ transfers });
}
