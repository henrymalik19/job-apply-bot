import { CronJob } from "cron";

import { JobSearchWorker } from "./workers/job-search-worker";

async function main() {
  new CronJob(
    "0 /5 * * * *",
    JobSearchWorker.start,
    null,
    true,
    "America/New_York"
  );
}

main().catch((e) => {
  console.error(e);
});
