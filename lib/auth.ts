import "server-only";
import { redirect } from "next/navigation";
import { createUserClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { isOwnerId } from "@/lib/owner";

export type Owner = { id: string; email: string | undefined };

// Data Access Layer entry point: every admin page, action and route calls this.
export async function requireOwner(): Promise<Owner> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/admin/login");
  if (!isOwnerId(data.user.id, serverEnv().OWNER_USER_ID)) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=not_owner");
  }
  return { id: data.user.id, email: data.user.email };
}
