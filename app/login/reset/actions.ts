"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { updateOwnerPassword } from "@/server/auth/session";

/** New-password form state. */
export type ResetState = { error?: string };

const input = z
  .object({ password: z.string().min(12, "Use at least 12 characters."), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The passwords don't match." });

/** Saves the new password and goes to the app. */
export async function setPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = input.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const result = await updateOwnerPassword(parsed.data.password);
  if (!result.ok) return { error: result.error };
  redirect("/app");
}
