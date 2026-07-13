import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/portfolio" className="flex items-center gap-2 pr-2">
            <Image
              src="/logo.png"
              alt="Bank of the Bovine Overlord"
              width={28}
              height={28}
              className="rounded-full"
            />
            <span className="hidden font-semibold sm:inline">
              Bank of the Bovine Overlord
            </span>
          </Link>
          <Link href="/portfolio">Portfolio</Link>
          <Link href="/lookup">Lookup</Link>
          <Link href="/orders">Orders</Link>
          <Link href="/watchlist">Watchlist</Link>
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/account">Account</Link>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span>{user.displayName}</span>
          <form action={signOutAction}>
            <button type="submit" className="underline">
              Log out
            </button>
          </form>
        </div>
      </header>
      <DisclaimerBanner />
      <main className="flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
