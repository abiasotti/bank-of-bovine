import { hash, verify } from "@node-rs/argon2";

// @node-rs/argon2 defaults to Argon2id, the recommended variant for
// password hashing (balances GPU-cracking resistance and side-channel
// resistance) - no need to override its defaults.
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  return verify(passwordHash, password);
}
