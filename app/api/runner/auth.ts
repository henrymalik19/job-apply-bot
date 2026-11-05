// The apply runner signs in to /api/runner/* with its own access token (Authorization: Bearer …), not
// cookies; requests run as that user, so their data rules and Claude budget apply.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/server/db/database.types";
import type { Db } from "@/server/db/types";
import { serverEnv } from "@/shared/env";

/** The signed-in runner's database client and user, or a 401 response. */
export async function runnerUser(request: Request): Promise<{ db: Db; userId: string } | Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "sign in first" }, { status: 401 });
  const env = serverEnv();
  const db = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as Db;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "sign in first" }, { status: 401 });
  return { db, userId: data.user.id };
}
