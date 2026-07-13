import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { postLedgerEntry } from "@/lib/ledger/postLedgerEntry";

// Every account starts with the same cash so the leaderboard measures
// trading skill, not who deposited more - there's no funding flow.
export const STARTING_CASH_BALANCE = "500000";

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

// Every user needs an Account + Watchlist to exist before anything else in
// the app (orders, watchlists) works, so they're created together - along
// with the seed_funding ledger entry that gives the new account its
// starting cash - in one transaction at registration time.
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
    await postLedgerEntry(tx, {
      accountId: account.id,
      entryType: "seed_funding",
      amount: STARTING_CASH_BALANCE,
    });
    await tx.watchlist.create({
      data: { accountId: account.id },
    });
    return user;
  });
}
