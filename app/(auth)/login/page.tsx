import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth/auth.config";

async function loginAction(formData: FormData) {
  "use server";

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/portfolio",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=invalid_credentials");
    }
    throw error;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div className="flex flex-col items-center gap-2">
        <Image
          src="/logo.png"
          alt="Bank of the Bovine Overlord"
          width={200}
          height={200}
          className="rounded-full"
          priority
        />
        <h1 className="text-center text-2xl font-bold">
          Bank of the Bovine Overlord
        </h1>
        <p className="text-lg text-gray-600">Log in</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          Invalid email or password.
        </p>
      )}
      <form action={loginAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            name="email"
            required
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            name="password"
            required
            className="rounded border px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-white"
        >
          Log in
        </button>
      </form>
      <p className="text-sm">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="underline">
          Register
        </Link>
      </p>
    </main>
  );
}
