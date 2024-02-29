"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const task_queue_worker_1 = require("./task-queue-worker");
function main() {
    new task_queue_worker_1.TaskQueueWorker().init();
}
main();
