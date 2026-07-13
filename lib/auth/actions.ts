"use server";

import { signOut } from "@/lib/auth/auth.config";

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
