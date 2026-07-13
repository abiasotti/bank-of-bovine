import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { getAccountBalance } from "@/lib/ledger/getAccountBalance";
import { prisma } from "@/lib/db/client";
import {
  createTransfer,
  InvalidTransferAmountError,
} from "@/lib/ledger/transferService";
import { formatCurrency, parseDecimalInput, InvalidDecimalInputError } from "@/lib/money";
import { TransferForm } from "@/components/TransferForm";
import { TransactionHistory } from "@/components/TransactionHistory";

async function transferAction(formData: FormData) {
  "use server";

  const user = await requireCurrentUser();
  if (!user.account || !user.externalBankAccount) {
    throw new Error("Account not fully provisioned");
  }

  const rawAmount = String(formData.get("amount") ?? "");
  try {
    const amount = parseDecimalInput(rawAmount);
    await createTransfer({
      accountId: user.account.id,
      externalBankAccountId: user.externalBankAccount.id,
      amount,
    });
  } catch (error) {
    if (
      error instanceof InvalidDecimalInputError ||
      error instanceof InvalidTransferAmountError
    ) {
      redirect("/account?error=invalid_amount");
    }
    throw error;
  }

  redirect("/account");
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireCurrentUser();
  if (!user.account) {
    throw new Error("Account not fully provisioned");
  }

  const balance = await getAccountBalance(user.account.id);
  const transfers = await prisma.transfer.findMany({
    where: { accountId: user.account.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Account</h1>
        <p className="mt-2 text-2xl font-bold">{formatCurrency(balance)}</p>
        <p className="text-sm text-gray-600">Cash balance</p>
      </div>
      {error === "invalid_amount" && (
        <p role="alert" className="text-sm text-red-600">
          Transfer amount must be a positive number.
        </p>
      )}
      <TransferForm action={transferAction} />
      <TransactionHistory transfers={transfers} />
    </div>
  );
}
