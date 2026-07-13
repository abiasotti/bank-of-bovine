import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/lib/auth/auth.config";
import {
  registerUser,
  EmailAlreadyRegisteredError,
} from "@/lib/auth/registerUser";

async function registerAction(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "");

  try {
    await registerUser({ email, password, displayName });
  } catch (error) {
    if (error instanceof EmailAlreadyRegisteredError) {
      redirect("/register?error=email_taken");
    }
    if (error instanceof z.ZodError) {
      redirect("/register?error=invalid_input");
    }
    throw error;
  }

  await signIn("credentials", { email, password, redirectTo: "/portfolio" });
}

const ERROR_MESSAGES: Record<string, string> = {
  email_taken: "An account with this email already exists.",
  invalid_input:
    "Please check your email, password (min 8 characters), and name.",
};

export default async function RegisterPage({
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
        <p className="text-lg text-gray-600">Create your account</p>
      </div>
      {error && ERROR_MESSAGES[error] && (
        <p role="alert" className="text-sm text-red-600">
          {ERROR_MESSAGES[error]}
        </p>
      )}
      <form action={registerAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Display name
          <input
            type="text"
            name="displayName"
            required
            className="rounded border px-3 py-2"
          />
        </label>
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
            minLength={8}
            className="rounded border px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-white"
        >
          Create account
        </button>
      </form>
      <p className="text-sm">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
