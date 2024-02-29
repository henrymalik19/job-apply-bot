import { Queue } from "bullmq";

import { REDIS_HOST, REDIS_PORT } from "../constants";

const jobSearchQueueName = "jobSearchQueue";
const jobSearchQueue = new Queue(jobSearchQueueName, {
  connection: { host: REDIS_HOST, port: REDIS_PORT },
});

export { jobSearchQueueName, jobSearchQueue };
