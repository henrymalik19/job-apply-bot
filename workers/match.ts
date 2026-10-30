// Match worker: for every user, scores open jobs from boards they follow that
// they have no match for yet. Runs inside the pipeline; this entry point is for
// running it by hand.
//   pnpm worker:match   (reads .env.local locally; Railway variables in production)
import { createServiceClient } from "@/server/db/service-client";
import { parseWorkerEnv } from "@/shared/env";
import { match, runStages } from "./stages";

async function main() {
  const db = createServiceClient(parseWorkerEnv(process.env));
  if (!(await runStages(db, [match]))) process.exitCode = 1;
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  process.exit(1);
});
