// Notify worker: for every user, emails a digest of applications that need
// attention, from and to their job inbox (user settings `job_inbox` and
// `notifications`). Runs inside the pipeline and the sweep; this entry point is
// for running it by hand.
//   pnpm worker:notify   (reads .env.local locally; Railway variables in production)
import { createServiceClient } from "@/server/db/service-client";
import { parseWorkerEnv } from "@/shared/env";
import { notify, runStages } from "./stages";

async function main() {
  const db = createServiceClient(parseWorkerEnv(process.env));
  if (!(await runStages(db, [notify]))) process.exitCode = 1;
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  process.exit(1);
});
