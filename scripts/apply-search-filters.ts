// Sets the discovery job filter and re-applies all filters to saved jobs.
//   pnpm apply:filters -- --remote-only --locations "US" --max-age 30 [--dry-run]
// Uses the service-role connection from the environment (.env.local locally).
import { createServiceClient } from "@/server/db/service-client";
import { getJobFilter, saveJobFilter } from "@/server/modules/criteria/criteria.service";
import { pruneSavedJobs } from "@/server/modules/discovery/discovery.service";
import { parseWorkerEnv } from "@/shared/env";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const db = createServiceClient(parseWorkerEnv(process.env));
  if (process.argv.includes("--remote-only") || arg("--locations") || arg("--max-age")) {
    const current = await getJobFilter(db);
    const remoteOnly = process.argv.includes("--remote-only");
    await saveJobFilter(db, {
      workTypes: remoteOnly ? ["remote"] : current.work_types,
      locations: arg("--locations") ?? current.locations.join(", "),
      keepUnknownWorkType: remoteOnly ? false : current.keep_unknown_work_type,
      keepRemoteWithoutLocation: current.keep_remote_without_location,
      maxAgeDays: arg("--max-age") ?? String(current.max_age_days),
    });
  }
  console.log(JSON.stringify({ filter: await getJobFilter(db) }));
  if (process.argv.includes("--dry-run")) return;
  console.log(JSON.stringify({ ok: true, ...(await pruneSavedJobs(db, new Date())) }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  process.exit(1);
});
