// Notify worker: emails a digest of applications that need attention, from
// and to the job inbox (settings `job_inbox` and `notifications`).
//   pnpm worker:notify   (reads .env.local locally; Railway variables in production)
// Needs JOB_INBOX_PASSWORD; also runs at the end of the pipeline.
import { createServiceClient } from "@/server/db/service-client";
import { runNotify } from "@/server/modules/notifications/notifications.service";
import { parseWorkerEnv } from "@/shared/env";

async function main() {
  const db = createServiceClient(parseWorkerEnv(process.env));
  const password = process.env.JOB_INBOX_PASSWORD;
  if (!password) throw new Error("JOB_INBOX_PASSWORD is not set");
  const { counts } = await runNotify({ db, password, log: (line) => console.log(line) });
  console.log(JSON.stringify({ stage: "notify", ok: true, counts }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  process.exit(1);
});
