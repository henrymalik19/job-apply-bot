import IORedis from "ioredis";

import { REDIS_HOST, REDIS_PORT } from "../../constants";
import { JobApplyWorker } from "./job-apply-worker";

const connection = new IORedis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
});

function main() {
  new JobApplyWorker().init(connection);
}

main();
