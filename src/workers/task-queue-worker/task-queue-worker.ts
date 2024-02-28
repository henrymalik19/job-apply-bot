import { CronJob } from "cron";
import { and, eq, lte } from "drizzle-orm";

import { TASK_EXECUTION_STATUSES, USER_JOB_STATUSES } from "../../constants";
import { db } from "../../database/db";
import { jobsTable } from "../../database/schema/jobs";
import {
  TaskExecution,
  taskExecutionsTable,
} from "../../database/schema/taskExecutions";
import {
  TaskSchedule,
  taskSchedulesTable,
} from "../../database/schema/taskSchedules";
import { userJobsTable } from "../../database/schema/userJobs";
import { User, usersTable } from "../../database/schema/users";
import { jobApplyQueue } from "../../queues/job-apply-queue";
import { jobSearchQueue } from "../../queues/job-search-queue";
import { JobApplyQueueJob, JobSearchQueueJob } from "../../types";
import { getNextDateFromCron } from "../../utils";

class TaskQueueWorker {
  init() {
    console.info("[info] starting task-queue-worker...");

    const job = new CronJob("*/30 * * * * *", () => this.start(), null, null); // ,"America/New_York")
    job.start();
  }

  private async start() {
    try {
      console.info("[info] searching for tasks to schedule...");

      const now = new Date();
      const tasksToSchedule = await db
        .select()
        .from(taskSchedulesTable)
        .where(
          and(
            lte(taskSchedulesTable.nextRunAt, now),
            eq(taskSchedulesTable.enabled, true),
          ),
        );

      console.info(
        tasksToSchedule.length === 0
          ? `[info] no new tasks found`
          : `[info] found ${tasksToSchedule.length} task(s)!`,
      );

      for (const taskToSchedule of tasksToSchedule) {
        // JOB SEARCH TASK
        if (taskToSchedule.taskId === 1) {
          await this.pushToJobSearchQueue(taskToSchedule);
        }

        // JOB APPLY TASK
        else if (taskToSchedule.taskId === 2) {
          await this.pushToJobApplyQueue(taskToSchedule);
        }

        console.info(`[info] updating 'nextRunAt' for task...`);

        await db
          .update(taskSchedulesTable)
          .set({
            nextRunAt: getNextDateFromCron(taskToSchedule.frequency),
            updatedAt: new Date(),
          })
          .where(eq(taskSchedulesTable.id, taskToSchedule.id));
      }
    } catch (error) {
      console.log(error);
      console.info("[error] error with task-queue-worker job");
    }
  }

  private async pushToJobSearchQueue(taskToSchedule: TaskSchedule) {
    const taskToExecute = await this.createTaskExecution(taskToSchedule);
    if (!taskToExecute) return;

    try {
      console.info(`[info] adding job to the jobSearchQueue...`);
      await jobSearchQueue.add(
        `user:${taskToSchedule.userId}-schedule:${taskToSchedule.id}-job-search`,
        {
          taskExecutionId: taskToExecute.id,
          userId: taskToSchedule.userId as number,
          preferenceId: taskToSchedule.preferenceId as number,
        } satisfies JobSearchQueueJob,
      );
    } catch (error: any) {
      console.info("[error] error pushing job to jobSearchQueue");

      await db
        .update(taskExecutionsTable)
        .set({
          status: TASK_EXECUTION_STATUSES.FAILED,
          endedAt: new Date(),
          details: error.message as string,
        })
        .where(eq(taskExecutionsTable.id, taskToExecute.id));
    }
  }

  private async pushToJobApplyQueue(taskToSchedule: TaskSchedule) {
    let user: User;
    let jobsToApply: { id: number; platformId: number }[];

    try {
      user = (
        await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, taskToSchedule.userId))
      )[0];

      jobsToApply = await db
        .select({ id: userJobsTable.id, platformId: jobsTable.platformId })
        .from(userJobsTable)
        .innerJoin(jobsTable, eq(jobsTable.id, userJobsTable.jobId))
        .where(
          and(
            eq(userJobsTable.userId, taskToSchedule.userId),
            eq(userJobsTable.status, USER_JOB_STATUSES.READY),
          ),
        )
        .limit(user.dailyApplicationLimit);
    } catch (error) {
      console.info(`[error] error querying database -> pushToApplyJobQueue()`);
      return;
    }

    if (jobsToApply.length === 0) {
      console.info(
        `[info] no jobs to apply to for user ${taskToSchedule.userId}, continuing...`,
      );
      return;
    }

    for (const jobToApply of jobsToApply) {
      const taskToExecute = await this.createTaskExecution(taskToSchedule);
      if (!taskToExecute) return;

      try {
        await db
          .update(userJobsTable)
          .set({
            taskExecutionId: taskToExecute.id,
            status: USER_JOB_STATUSES.PENDING,
          })
          .where(eq(userJobsTable.id, jobToApply.id));

        console.info(`[info] adding job to the jobApplyQueue...`);
        await jobApplyQueue.add(
          `user:${taskToSchedule.userId}-schedule:${taskToSchedule.id}-user_job:${jobToApply.id}-job-apply`,
          {
            taskExecutionId: taskToExecute.id,
            userJobId: jobToApply.id,
          } satisfies JobApplyQueueJob,
        );
      } catch (error: any) {
        console.info("[error] error pushing job to jobApplyQueue");

        await db
          .update(taskExecutionsTable)
          .set({
            status: TASK_EXECUTION_STATUSES.FAILED,
            endedAt: new Date(),
            details: error.message as string,
          })
          .where(eq(taskExecutionsTable.id, taskToExecute.id));
      }
    }
  }

  private async createTaskExecution(
    taskToSchedule: TaskSchedule,
  ): Promise<TaskExecution | null> {
    try {
      console.info(`[info] creating an entry in the taskExecutions table...`);

      const taskToExecute = (
        await db
          .insert(taskExecutionsTable)
          .values({
            status: TASK_EXECUTION_STATUSES.PENDING,
            scheduleId: taskToSchedule.id,
            startedAt: new Date(),
          })
          .returning()
      )[0];

      return taskToExecute;
    } catch {
      console.info(
        `[error] error creating taskExecution entry for task: ${taskToSchedule.id} -> pushToJobSearchQueue()`,
      );
      return null;
    }
  }
}

export { TaskQueueWorker };
