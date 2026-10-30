// Sets the owner's discovery job filter and re-applies every user's filters to saved jobs.
//   pnpm apply:filters -- --remote-only --locations "US" --max-age 30 [--dry-run]
// Uses the service-role connection from the environment (.env.local locally).
import { createServiceClient } from "@/server/db/service-client";
import { getJobFilter, saveJobFilter } from "@/server/modules/criteria/criteria.service";
import { pruneSavedJobs } from "@/server/modules/discovery/discovery.service";
import { listUsers, ownerId } from "@/server/modules/users/users.service";
import { parseWorkerEnv } from "@/shared/env";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const db = createServiceClient(parseWorkerEnv(process.env));
  const owner = await ownerId(db);
  if (!owner) throw new Error("No owner set; run pnpm owner:set first");
  if (process.argv.includes("--remote-only") || arg("--locations") || arg("--max-age")) {
    const current = await getJobFilter(db, owner);
    const remoteOnly = process.argv.includes("--remote-only");
    await saveJobFilter(db, owner, {
      workTypes: remoteOnly ? ["remote"] : current.work_types,
      locations: arg("--locations") ?? current.locations.join(", "),
      keepUnknownWorkType: remoteOnly ? false : current.keep_unknown_work_type,
      keepRemoteWithoutLocation: current.keep_remote_without_location,
      maxAgeDays: arg("--max-age") ?? String(current.max_age_days),
    });
  }
  console.log(JSON.stringify({ filter: await getJobFilter(db, owner) }));
  if (process.argv.includes("--dry-run")) return;
  console.log(JSON.stringify({ ok: true, ...(await pruneSavedJobs(db, (await listUsers(db)).map((u) => u.id), new Date())) }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  process.exit(1);
});
