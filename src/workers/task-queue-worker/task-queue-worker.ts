import { CronJob } from "cron";

import { TASK_TYPES } from "../../constants";
import { TaskSchedule } from "../../database/schema/taskSchedules";
import { jobApplyQueue } from "../../queues/job-apply-queue";
import { jobSearchQueue } from "../../queues/job-search-queue";
import { TaskService } from "../../services/task";
import { TaskScheduleService } from "../../services/task-schedule";
import { UserService } from "../../services/user";
import { UserJobService } from "../../services/user-job";
import { JobApplyQueueJob, JobSearchQueueJob } from "../../types";

class TaskQueueWorker {
  taskService: TaskService;
  taskScheduleService: TaskScheduleService;
  userService: UserService;
  userJobService: UserJobService;

  constructor(
    _taskService: TaskService,
    _taskScheduleService: TaskScheduleService,
    _userService: UserService,
    _userJobService: UserJobService,
  ) {
    this.taskService = _taskService;
    this.taskScheduleService = _taskScheduleService;
    this.userService = _userService;
    this.userJobService = _userJobService;
  }

  init() {
    console.info("[info] starting task-queue-worker...");

    const job = new CronJob("*/30 * * * * *", () => this.start(), null, null); // ,"America/New_York")
    job.start();
  }

  private async start() {
    try {
      console.info("[info] searching for tasks to schedule...");

      const tasksToSchedule =
        await this.taskScheduleService.findAllReadyToSchedule();

      console.info(
        tasksToSchedule.length === 0
          ? `[info] no new tasks found`
          : `[info] found ${tasksToSchedule.length} task(s)!`,
      );

      for (const taskToSchedule of tasksToSchedule) {
        const task = await this.taskService.findById(taskToSchedule.taskId);

        switch (task.name) {
          case TASK_TYPES.JOB_APPLY:
            await this.pushToJobApplyQueue(taskToSchedule);
            break;

          case TASK_TYPES.JOB_SEARCH:
            await this.pushToJobSearchQueue(taskToSchedule);
            break;

          default:
            break;
        }

        //   console.info(`[info] updating 'nextRunAt' for task...`);
        //   await db
        //     .update(taskSchedulesTable)
        //     .set({
        //       nextRunAt: getNextDateFromCron(taskToSchedule.frequency),
        //       updatedAt: new Date(),
        //     })
        //     .where(eq(taskSchedulesTable.id, taskToSchedule.id));
      }
    } catch (error) {
      console.log(error);
      console.info("[error] error with task-queue-worker job");
    }
  }

  private async pushToJobSearchQueue(taskToSchedule: TaskSchedule) {
    try {
      console.info(`[info] adding job to the jobSearchQueue...`);
      await jobSearchQueue.add(
        `user:${taskToSchedule.userId}-schedule:${taskToSchedule.id}-job-search`,
        {
          userId: taskToSchedule.userId as number,
          preferenceId: taskToSchedule.preferenceId as number,
        } satisfies JobSearchQueueJob,
      );
    } catch (error: any) {
      console.info("[error] error pushing job to jobSearchQueue");
    }
  }

  private async pushToJobApplyQueue(taskToSchedule: TaskSchedule) {
    const user = await this.userService.findById(taskToSchedule.userId);
    const jobsToApply = await this.userJobService.findReadyToApply(
      user.id,
      user.dailyApplicationLimit,
    );

    if (jobsToApply.length === 0) {
      console.info(
        `[info] no jobs to apply to for user ${taskToSchedule.userId}, continuing...`,
      );
      return;
    }

    for (const jobToApply of jobsToApply) {
      try {
        console.info(`[info] adding job to the jobApplyQueue...`);
        await jobApplyQueue.add(
          `user:${taskToSchedule.userId}-schedule:${taskToSchedule.id}-user_job:${jobToApply.id}-job-apply`,
          {
            userJobId: jobToApply.id,
          } satisfies JobApplyQueueJob,
        );
      } catch (error: any) {
        console.info("[error] error pushing job to jobApplyQueue");
      }
    }
  }
}

export { TaskQueueWorker };
