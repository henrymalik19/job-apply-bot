// Pipeline worker (the Railway cron service): discover → match → notify, in one process.
//   pnpm worker:pipeline   (reads .env.local locally; Railway variables in production)
// Matching needs ANTHROPIC_API_KEY and notify needs JOB_INBOX_PASSWORD; a
// stage whose variable is missing is skipped with a log line. Exits non-zero
// only when a stage fails as a whole; per-board and per-job failures are
// recorded and shown on Health.
import { createServiceClient } from "@/server/db/service-client";
import { createClaudeCaller } from "@/server/integrations/anthropic/claude";
import { runDiscover } from "@/server/modules/discovery/discovery.service";
import { runMatch } from "@/server/modules/matching/matching.service";
import { runNotify } from "@/server/modules/notifications/notifications.service";
import { parseWorkerEnv } from "@/shared/env";

async function main() {
  const db = createServiceClient(parseWorkerEnv(process.env));
  const log = (line: string) => console.log(line);

  const discovered = await runDiscover({ db, log });
  console.log(JSON.stringify({ stage: "discover", ok: true, counts: discovered.counts }));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(JSON.stringify({ stage: "match", skipped: "ANTHROPIC_API_KEY is not set" }));
  } else {
    const matched = await runMatch({ db, call: createClaudeCaller(), log });
    console.log(JSON.stringify({ stage: "match", ok: true, counts: matched.counts }));
  }

  const password = process.env.JOB_INBOX_PASSWORD;
  if (!password) {
    console.log(JSON.stringify({ stage: "notify", skipped: "JOB_INBOX_PASSWORD is not set" }));
    return;
  }
  const notified = await runNotify({ db, password, log });
  console.log(JSON.stringify({ stage: "notify", ok: true, counts: notified.counts }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  process.exit(1);
});
