import { Queue } from "bullmq";

import { REDIS_HOST, REDIS_PORT } from "../constants";

const jobApplyQueueName = "jobApplyQueue";
const jobApplyQueue = new Queue(jobApplyQueueName, {
  connection: { host: REDIS_HOST, port: REDIS_PORT },
});

export { jobApplyQueueName, jobApplyQueue };
