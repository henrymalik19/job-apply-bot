// Writes OWNER_USER_ID into the owner table so RLS recognizes that user.
// Run once per environment after creating the owner account in Supabase Auth:
//   pnpm owner:set   (reads .env.local)
import { createServiceClient } from "@/server/db/service-client";
import { setOwner } from "@/server/auth/owner.repository";
import { parseServerEnv } from "@/shared/env";

async function main() {
  const env = parseServerEnv(process.env);
  const db = createServiceClient(env);

  const { data: user, error: userErr } = await db.auth.admin.getUserById(env.OWNER_USER_ID);
  if (userErr || !user.user) throw new Error("OWNER_USER_ID does not match an existing auth user");

  await setOwner(db, env.OWNER_USER_ID);
  console.log(JSON.stringify({ ok: true, owner: env.OWNER_USER_ID }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message ?? err) }));
  process.exit(1);
});
