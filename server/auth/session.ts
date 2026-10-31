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

/**
 * Emails a password-reset link. Supabase sends it only if the account exists,
 * and only to `redirectTo` if that URL is in Auth's redirect allow list
 * (otherwise it falls back to the Site URL).
 */
export async function sendPasswordReset(email: string, redirectTo: string): Promise<void> {
  const db = await createUserClient();
  await db.auth.resetPasswordForEmail(email, { redirectTo });
}

/** Turns the code from an emailed link into a session; false if it is invalid or expired. */
export async function exchangeAuthCode(code: string): Promise<boolean> {
  const db = await createUserClient();
  const { error } = await db.auth.exchangeCodeForSession(code);
  return !error;
}

/**
 * Sets a new password for the signed-in owner (after a reset link signed them in).
 *
 * @param password - The new password (never logged).
 */
export async function updateOwnerPassword(password: string): Promise<SignInResult> {
  const db = await createUserClient();
  const { data } = await db.auth.getUser();
  if (!data.user || !isOwnerId(data.user.id, serverEnv().OWNER_USER_ID)) {
    return { ok: false, error: "The reset link has expired. Request a new one." };
  }
  const { error } = await db.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
