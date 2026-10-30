// Sweep worker (Railway cron, every 15 minutes): for every user, prepare →
// notify. Picks up whatever the pipeline didn't: the daily cap's leftovers on a
// new day, retries, and anything another worker left waiting for an email.
// With nothing waiting it finishes in seconds. M6's inbox reader joins it.
//   pnpm worker:sweep   (reads .env.local locally; Railway variables in production)
import { createServiceClient } from "@/server/db/service-client";
import { parseWorkerEnv } from "@/shared/env";
import { notify, prepare, runStages } from "./stages";

async function main() {
  const db = createServiceClient(parseWorkerEnv(process.env));
  if (!(await runStages(db, [prepare(), notify]))) process.exitCode = 1;
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  process.exit(1);
});
