// What Admin shows about every user: who they are and where their applications stand.
// Called with the admin (service-role) client from adminContext, so it reads all users.
import type { Db } from "@/server/db/types";
import { unwrap } from "@/server/core/errors";
import { getApplication, type ApplicationWithDetails } from "@/server/modules/applications/applications.service";

/** One user on Admin > Users. */
export type AdminUser = {
  id: string;
  role: string;
  name: string;
  email: string | null;
  joinedAt: string;
  /** Applications by status. */
  counts: Record<string, number>;
  total: number;
  lastActivityAt: string | null;
};

/** A user's display name from their profile, or their email, or "Someone". */
export const displayName = (p: { first_name: string | null; last_name: string | null; preferred_name?: string | null; email?: string | null } | null) =>
  [p?.preferred_name || p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.email || "Someone";

/** Every user with their profile name and application counts, most recently active first. */
export async function listUsers(admin: Db): Promise<AdminUser[]> {
  const [users, profiles, apps] = await Promise.all([
    admin.from("users").select("id, role, created_at").then((r) => unwrap(r, "list users")),
    admin.from("profiles").select("user_id, first_name, last_name, preferred_name, email").then((r) => unwrap(r, "list profiles")),
    admin.from("applications").select("user_id, status, last_status_at").then((r) => unwrap(r, "list applications")),
  ]);
  const byUser = new Map(profiles.map((p) => [p.user_id, p]));
  return users
    .map((u) => {
      const mine = apps.filter((a) => a.user_id === u.id);
      const counts: Record<string, number> = {};
      for (const a of mine) counts[a.status] = (counts[a.status] ?? 0) + 1;
      const last = mine.reduce<string | null>((m, a) => (!m || a.last_status_at > m ? a.last_status_at : m), null);
      const profile = byUser.get(u.id) ?? null;
      return { id: u.id, role: u.role, name: displayName(profile), email: profile?.email ?? null, joinedAt: u.created_at, counts, total: mine.length, lastActivityAt: last };
    })
    .sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));
}

/** One user's profile row, or null. */
export async function getUserProfile(admin: Db, userId: string) {
  return unwrap(await admin.from("profiles").select("*").eq("user_id", userId).limit(1), "get profile")[0] ?? null;
}

/** Any user's application with its job and questions, and whose it is. */
export async function getAnyApplication(admin: Db, id: string): Promise<{ app: ApplicationWithDetails; userId: string } | null> {
  const row = unwrap(await admin.from("applications").select("user_id").eq("id", id).limit(1), "find application")[0];
  if (!row) return null;
  const app = await getApplication(admin, row.user_id, id);
  return app ? { app, userId: row.user_id } : null;
}
