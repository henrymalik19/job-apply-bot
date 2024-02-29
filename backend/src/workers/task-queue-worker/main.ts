import { TaskService } from "../../services/task";
import { TaskScheduleService } from "../../services/task-schedule";
import { UserService } from "../../services/user";
import { UserJobService } from "../../services/user-job";
import { TaskQueueWorker } from "./task-queue-worker";

function main() {
  new TaskQueueWorker(
    new TaskService(),
    new TaskScheduleService(),
    new UserService(),
    new UserJobService(),
  ).init();
}

main();
