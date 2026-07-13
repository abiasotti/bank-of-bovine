import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { cancelOrderAction } from "@/lib/orders/actions";
import { OrdersTable } from "@/components/OrdersTable";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireCurrentUser();
  if (!user.account) {
    throw new Error("Account not fully provisioned");
  }

  const orders = await prisma.order.findMany({
    where: { accountId: user.account.id },
    orderBy: { submittedAt: "desc" },
    include: { security: true },
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Orders</h1>
        <p className="mt-1 text-sm text-gray-600">
          Your pending and past orders. Place a new trade from{" "}
          <Link href="/lookup" className="underline">
            Lookup
          </Link>
          .
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <OrdersTable orders={orders} cancelAction={cancelOrderAction} />
    </div>
  );
}
