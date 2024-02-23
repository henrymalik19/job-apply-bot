import IORedis from "ioredis";

import { REDIS_HOST, REDIS_PORT } from "../../constants";
import { JobSearchWorker } from "./job-search-worker";

const connection = new IORedis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
});
function main() {
  new JobSearchWorker().init(connection);
}

main();
