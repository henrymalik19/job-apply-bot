// Discover worker: pulls every active Greenhouse/Lever/Ashby board into `jobs`.
//   pnpm worker:discover   (reads .env.local locally; Railway variables in production)
// Exits non-zero only when the run itself fails; per-board failures are
// recorded in `runs` and shown on the Health page.
import { createServiceClient } from "@/server/db/service-client";
import { runDiscover } from "@/server/modules/discovery/discovery.service";
import { parseWorkerEnv } from "@/shared/env";

async function main() {
  const db = createServiceClient(parseWorkerEnv(process.env));
  const summary = await runDiscover({ db, log: (line) => console.log(line) });
  console.log(JSON.stringify({ ok: true, counts: summary.counts }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  process.exit(1);
});
