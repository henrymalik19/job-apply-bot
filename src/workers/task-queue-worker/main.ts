import { TaskQueueWorker } from "./task-queue-worker";

function main() {
  new TaskQueueWorker().init();
}

main();
