// Pipeline worker (Railway cron, every 6 hours): discover, then for every user
// match → prepare → notify, in one process, so new jobs are prepared and
// emailed minutes after they're found.
//   pnpm worker:pipeline   (reads .env.local locally; Railway variables in production)
// Matching and prepare need ANTHROPIC_API_KEY, notify needs JOB_INBOX_PASSWORD;
// a stage whose variable is missing is skipped with a log line. Exits non-zero
// when discovery fails as a whole or any stage fails for a user; per-board and
// per-job failures are recorded and shown on Health.
import { createServiceClient } from "@/server/db/service-client";
import { runDiscover } from "@/server/modules/discovery/discovery.service";
import { parseWorkerEnv } from "@/shared/env";
import { match, notify, prepare, runStages } from "./stages";

async function main() {
  const db = createServiceClient(parseWorkerEnv(process.env));
  const discovered = await runDiscover({ db, log: (line) => console.log(line) });
  console.log(JSON.stringify({ stage: "discover", ok: true, counts: discovered.counts }));
  if (!(await runStages(db, [match, prepare(), notify]))) process.exitCode = 1;
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  process.exit(1);
});
