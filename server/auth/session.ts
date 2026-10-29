import "server-only";
import { createUserClient } from "@/server/db/user-client";
import { serverEnv } from "@/shared/env";
import { isOwnerId } from "./owner";

/** Outcome of an owner sign-in attempt; `error` is safe to show to the user. */
export type SignInResult = { ok: true } | { ok: false; error: string };

/**
 * Signs in with email and password and keeps the session only if the user is
 * the owner. Any other account is signed straight back out.
 *
 * @param email - Login email.
 * @param password - Login password (never logged).
 */
export async function signInOwner(email: string, password: string): Promise<SignInResult> {
  const db = await createUserClient();
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { ok: false, error: "Sign-in failed." };
  if (!isOwnerId(data.user.id, serverEnv().OWNER_USER_ID)) {
    await db.auth.signOut();
    return { ok: false, error: "This account is not allowed." };
  }
  return { ok: true };
}

/** Ends the current session (clears the auth cookies). */
export async function signOutCurrentUser(): Promise<void> {
  const db = await createUserClient();
  await db.auth.signOut();
}
