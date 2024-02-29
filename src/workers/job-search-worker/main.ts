import IORedis from "ioredis";

import { REDIS_HOST, REDIS_PORT } from "../../constants";
import { CredentialService } from "../../services/credential";
import { JobService } from "../../services/job";
import { PlatformService } from "../../services/platform";
import { TaskExecutionService } from "../../services/task-execution";
import { UserJobService } from "../../services/user-job";
import { UserJobPreferenceService } from "../../services/user-job-preference";
import { JobSearchWorker } from "./job-search-worker";

const connection = new IORedis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
});
function main() {
  new JobSearchWorker(
    new CredentialService(),
    new JobService(),
    new TaskExecutionService(),
    new UserJobService(),
    new UserJobPreferenceService(),
    new PlatformService(),
  ).init(connection);
}

main();
