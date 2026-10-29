// Discover worker: pulls every active Greenhouse/Lever/Ashby board into `jobs`.
//   pnpm worker:discover   (reads .env.local locally; GitHub Actions secrets in CI)
// Exits non-zero only when the run itself fails; per-board failures are
// recorded in `runs` and shown on the Health page.
import { createClient } from "@supabase/supabase-js";
import { parseWorkerEnv } from "../lib/env";
import { runDiscover } from "../lib/discover/run";

async function main() {
  const env = parseWorkerEnv(process.env);
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const summary = await runDiscover({ db, log: (line) => console.log(line) });
  console.log(JSON.stringify({ ok: true, counts: summary.counts }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  process.exit(1);
});
