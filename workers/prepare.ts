// Prepare worker: prepares applications for the best-scoring jobs (forms,
// answers, tailored resumes), up to the daily cap.
//   pnpm worker:prepare [--limit N]   (reads .env.local locally; Railway variables in production)
// Not on the cron schedule yet; it joins the pipeline once notifications exist.
import { createServiceClient } from "@/server/db/service-client";
import { createClaudeCaller, DRAFTING_MODEL } from "@/server/integrations/anthropic/claude";
import { runPrepare } from "@/server/modules/prepare/prepare.service";
import { parseWorkerEnv } from "@/shared/env";

async function main() {
  const db = createServiceClient(parseWorkerEnv(process.env));
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const at = process.argv.indexOf("--limit");
  const limit = at > 0 ? Number(process.argv[at + 1]) : undefined;
  const { counts } = await runPrepare({
    db,
    call: createClaudeCaller(),
    draftCall: createClaudeCaller(DRAFTING_MODEL),
    limit,
    log: (line) => console.log(line),
  });
  console.log(JSON.stringify({ stage: "prepare", ok: true, counts }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  process.exit(1);
});
