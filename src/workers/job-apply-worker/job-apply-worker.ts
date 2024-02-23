import { ConnectionOptions, Job, Worker } from "bullmq";
import { and, eq } from "drizzle-orm";
// import { chromium } from "playwright";
import { chromium } from "playwright-extra";

import { TASK_EXECUTION_STATUSES, USER_JOB_STATUSES } from "../../constants";
import { db } from "../../database/db";
import { credentialsTable } from "../../database/schema/credentials";
import { jobsTable } from "../../database/schema/jobs";
import { platformsTable } from "../../database/schema/platforms";
import {
  NewTaskExecution,
  taskExecutionsTable,
} from "../../database/schema/taskExecutions";
import { NewUserJob, userJobsTable } from "../../database/schema/userJobs";
import { Linkedin } from "../../platforms/linkedin/Linkedin";
import { jobApplyQueueName } from "../../queues/job-apply-queue";
import { JobApplyQueueJob } from "../../types";
import { decrypt } from "../../utils";

class JobApplyWorker {
  init(connection: ConnectionOptions) {
    console.info("[info] starting job-apply-worker...");
    console.info("[info] waiting for jobs...");

    new Worker(jobApplyQueueName, (job) => this.processQueue(job), {
      connection,
    });
  }

  private async processQueue(job: Job<JobApplyQueueJob>) {
    console.info("[info] new job received!");
    const { data } = job;

    try {
      console.info(`[info] processing job ${job.name}...`);

      await this.updateTaskExecution(data.taskExecutionId, {
        status: TASK_EXECUTION_STATUSES.IN_PROGRESS,
        startedAt: new Date(),
      });

      await this.performJobApplyTask(data.userJobId);

      await this.updateTaskExecution(data.taskExecutionId, {
        status: TASK_EXECUTION_STATUSES.SUCCESS,
        endedAt: new Date(),
      });

      console.info("[info] processing job complete");
    } catch (error: any) {
      console.info(
        `[info] error processing job. Task Execution Id:${data.taskExecutionId}`,
      );

      await db
        .update(userJobsTable)
        .set({ status: USER_JOB_STATUSES.FAILED })
        .where(eq(userJobsTable.id, data.userJobId));

      await this.updateTaskExecution(data.taskExecutionId, {
        status: TASK_EXECUTION_STATUSES.FAILED,
        endedAt: new Date(),
        details: error.message as string,
      });
    }
  }

  async performJobApplyTask(userJobId: number) {
    const userJob = (
      await db
        .select()
        .from(userJobsTable)
        .where(eq(userJobsTable.id, userJobId))
    )[0];

    await db
      .update(userJobsTable)
      .set({
        status: USER_JOB_STATUSES.APPLYING,
      })
      .where(eq(userJobsTable.id, userJob.id));

    const job = (
      await db.select().from(jobsTable).where(eq(jobsTable.id, userJob.jobId))
    )[0];

    const platform = (
      await db
        .select()
        .from(platformsTable)
        .where(eq(platformsTable.id, job.platformId))
    )[0];

    const credentials = (
      await db
        .select()
        .from(credentialsTable)
        .where(and(eq(credentialsTable.userId, userJob.userId as number)))
    )[0];

    switch (platform.name) {
      case "linkedin":
        await Linkedin.handleApplyForJobs({
          userId: userJob.userId as number,
          jobUrl: job.url,
          email: decrypt(credentials.email),
          password: decrypt(credentials.email),
        });

        break;
      default:
        break;
    }

    await db
      .update(userJobsTable)
      .set({
        status: USER_JOB_STATUSES.APPLIED,
      })
      .where(eq(userJobsTable.id, userJob.id));
  }

  async updateTaskExecution(id: number, values: NewTaskExecution) {
    await db
      .update(taskExecutionsTable)
      .set({ ...values })
      .where(eq(taskExecutionsTable.id, id));
  }
}

export { JobApplyWorker };
