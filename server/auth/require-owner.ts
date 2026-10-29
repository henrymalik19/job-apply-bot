import "server-only";
import { redirect } from "next/navigation";
import { createUserClient } from "@/server/db/user-client";
import type { Db } from "@/server/db/types";
import { serverEnv } from "@/shared/env";
import { isOwnerId } from "./owner";

/** The signed-in owner. */
export type Owner = { id: string; email: string | undefined };

/** What every admin page and action works with: who is signed in, and a client acting as them. */
export type OwnerContext = { owner: Owner; db: Db };

/**
 * Authorization gate for every admin page, server action and route handler.
 * Redirects to the login page when nobody is signed in, and signs out and
 * redirects any authenticated user who is not the owner.
 *
 * @returns The owner plus an RLS-bound client to hand to services.
 */
export async function ownerContext(): Promise<OwnerContext> {
  const db = await createUserClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) redirect("/admin/login");
  if (!isOwnerId(data.user.id, serverEnv().OWNER_USER_ID)) {
    await db.auth.signOut();
    redirect("/admin/login?error=not_owner");
  }
  return { owner: { id: data.user.id, email: data.user.email }, db };
}

/** Like {@link ownerContext} when only the owner (not the client) is needed. */
export async function requireOwner(): Promise<Owner> {
  return (await ownerContext()).owner;
}
