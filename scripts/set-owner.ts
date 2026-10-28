// Writes OWNER_USER_ID into the owner table so RLS recognizes that user.
// Run once per environment after creating the owner account in Supabase Auth:
//   pnpm owner:set   (reads .env.local)
import { createClient } from "@supabase/supabase-js";
import { parseServerEnv } from "../lib/env";

async function main() {
  const env = parseServerEnv(process.env);
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: user, error: userErr } = await db.auth.admin.getUserById(env.OWNER_USER_ID);
  if (userErr || !user.user) throw new Error("OWNER_USER_ID does not match an existing auth user");

  const { error } = await db.from("owner").upsert({ singleton: true, user_id: env.OWNER_USER_ID });
  if (error) throw new Error(`could not set owner: ${error.message}`);
  console.log(JSON.stringify({ ok: true, owner: env.OWNER_USER_ID }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message ?? err) }));
  process.exit(1);
});
