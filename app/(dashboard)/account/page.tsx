import { requireCurrentUser } from "@/lib/auth/session";
import { getAccountBalance } from "@/lib/ledger/getAccountBalance";
import { formatCurrency } from "@/lib/money";

export default async function AccountPage() {
  const user = await requireCurrentUser();
  if (!user.account) {
    throw new Error("Account not fully provisioned");
  }

  const balance = await getAccountBalance(user.account.id);

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Account</h1>
        <p className="mt-2 text-2xl font-bold">{formatCurrency(balance)}</p>
        <p className="text-sm text-gray-600">Cash balance</p>
      </div>

      <dl className="flex flex-col gap-3 text-sm sm:max-w-sm">
        <div className="flex justify-between border-b pb-1">
          <dt className="text-gray-500">Display name</dt>
          <dd>{user.displayName}</dd>
        </div>
        <div className="flex justify-between border-b pb-1">
          <dt className="text-gray-500">Email</dt>
          <dd>{user.email}</dd>
        </div>
        <div className="flex justify-between border-b pb-1">
          <dt className="text-gray-500">Member since</dt>
          <dd>{user.createdAt.toLocaleDateString()}</dd>
        </div>
      </dl>
    </div>
  );
}
