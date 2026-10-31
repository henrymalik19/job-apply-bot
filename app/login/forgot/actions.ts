"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { sendPasswordReset } from "@/server/auth/session";

/** Forgot-password form state. */
export type ForgotState = { sent?: boolean; error?: string };

/** Emails a reset link that comes back through /auth/confirm to /login/reset. */
export async function requestReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter your email." };
  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  await sendPasswordReset(email.data, `${origin}/auth/confirm?next=/login/reset`);
  return { sent: true };
}
