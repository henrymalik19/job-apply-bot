// Pipeline worker (the Railway cron service): discover → match, in one process.
//   pnpm worker:pipeline   (reads .env.local locally; Railway variables in production)
// Matching needs ANTHROPIC_API_KEY; without it, discovery still runs and
// matching is skipped with a log line. Exits non-zero only when a stage fails
// as a whole; per-board and per-job failures are recorded and shown on Health.
import { createServiceClient } from "@/server/db/service-client";
import { createClaudeCaller } from "@/server/integrations/anthropic/claude";
import { runDiscover } from "@/server/modules/discovery/discovery.service";
import { runMatch } from "@/server/modules/matching/matching.service";
import { parseWorkerEnv } from "@/shared/env";

async function main() {
  const db = createServiceClient(parseWorkerEnv(process.env));
  const log = (line: string) => console.log(line);

  const discovered = await runDiscover({ db, log });
  console.log(JSON.stringify({ stage: "discover", ok: true, counts: discovered.counts }));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(JSON.stringify({ stage: "match", skipped: "ANTHROPIC_API_KEY is not set" }));
    return;
  }
  const matched = await runMatch({ db, call: createClaudeCaller(), log });
  console.log(JSON.stringify({ stage: "match", ok: true, counts: matched.counts }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  process.exit(1);
});
