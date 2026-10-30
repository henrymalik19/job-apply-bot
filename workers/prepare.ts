// Prepare worker: for every user, prepares applications for their best-scoring
// jobs (forms, answers, tailored resumes), up to each user's daily cap. Railway runs
// it every 15 minutes (prepare service); the pipeline also chains it.
//   pnpm worker:prepare [--limit N]   (reads .env.local locally; Railway variables in production)
import { createServiceClient } from "@/server/db/service-client";
import { parseWorkerEnv } from "@/shared/env";
import { prepare, runStages } from "./stages";

async function main() {
  const db = createServiceClient(parseWorkerEnv(process.env));
  const at = process.argv.indexOf("--limit");
  const limit = at > 0 ? Number(process.argv[at + 1]) : undefined;
  if (!(await runStages(db, [prepare(limit)]))) process.exitCode = 1;
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  process.exit(1);
});
