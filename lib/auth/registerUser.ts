import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";

export const registerUserSchema = z.object({
  email: z.email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().trim().min(1).max(64),
});

export type RegisterUserInput = z.input<typeof registerUserSchema>;

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "EmailAlreadyRegisteredError";
  }
}

// Every user needs an Account + ExternalBankAccount + Watchlist to exist
// before anything else in the app (transfers, orders, watchlists) works, so
// they're created together in one transaction at registration time.
export async function registerUser(input: RegisterUserInput) {
  const normalized = {
    ...input,
    email: input.email.trim().toLowerCase(),
  };
  const { email, password, displayName } = registerUserSchema.parse(normalized);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new EmailAlreadyRegisteredError();
  }

  const passwordHash = await hashPassword(password);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, passwordHash, displayName },
    });
    const account = await tx.account.create({
      data: { userId: user.id },
    });
    await tx.externalBankAccount.create({
      data: { userId: user.id },
    });
    await tx.watchlist.create({
      data: { accountId: account.id },
    });
    return user;
  });
}
