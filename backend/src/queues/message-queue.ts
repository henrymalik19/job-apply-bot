import { Queue } from "bullmq";

import { REDIS_HOST, REDIS_PORT } from "../constants";

const messageQueueName = "MessageQueue";
const messageQueue = new Queue(messageQueueName, {
  connection: { host: REDIS_HOST, port: REDIS_PORT },
});

export { messageQueueName, messageQueue };
