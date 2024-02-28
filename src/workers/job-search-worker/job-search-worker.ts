import { Job as BullMqJob, ConnectionOptions, Worker } from "bullmq";
import { and, eq } from "drizzle-orm";
import { OnsiteRemoteFilterType } from "platforms/linkedin/types";
import { messageQueue } from "queues/message-queue";

import { TASK_EXECUTION_STATUSES, USER_JOB_STATUSES } from "../../constants";
import { db } from "../../database/db";
import { credentialsTable } from "../../database/schema/credentials";
import { NewJob, jobsTable } from "../../database/schema/jobs";
import { platformsTable } from "../../database/schema/platforms";
import {
  NewTaskExecution,
  taskExecutionsTable,
} from "../../database/schema/taskExecutions";
import { userJobPreferencesTable } from "../../database/schema/userJobPreferences";
import { userJobsTable } from "../../database/schema/userJobs";
import { Linkedin } from "../../platforms/linkedin/Linkedin";
import { jobSearchQueueName } from "../../queues/job-search-queue";
import { JobSearchQueueJob } from "../../types";
import { decrypt } from "../../utils";

interface PerformJobSearchTaskParams {
  userId: number;
  preferenceId: number;
  taskExecutionId: number;
}

interface PerformLinkedinJobSearchTaskParams {
  jobTitle: string;
  city: string | null;
  state: string | null;
  country: string;
  onsiteRemoteFilters: {
    remote: boolean;
    hybrid: boolean;
    onsite: boolean;
  };
  userId: number;
  platformId: number;
}

class JobSearchWorker {
  init(connection: ConnectionOptions) {
    console.info("[info] starting job-search-worker...");
    console.info("[info] waiting for jobs...");

    new Worker(jobSearchQueueName, (job) => this.processQueue(job), {
      connection,
    });
  }

  private async processQueue(job: BullMqJob<JobSearchQueueJob>) {
    console.info("[info] new job received!");
    const { data } = job;

    try {
      console.info(`[info] processing job ${job.name}...`);

      await this.updateTaskExecution(data.taskExecutionId, {
        status: TASK_EXECUTION_STATUSES.IN_PROGRESS,
        startedAt: new Date(),
      });

      await this.performJobSearchTask({
        userId: data.userId,
        preferenceId: data.preferenceId,
        taskExecutionId: data.taskExecutionId,
      });

      await this.updateTaskExecution(data.taskExecutionId, {
        status: TASK_EXECUTION_STATUSES.SUCCESS,

        endedAt: new Date(),
      });

      console.info("[info] processing job complete");
    } catch (error: any) {
      console.info(
        `[info] error processing job. Task Execution Id:${data.taskExecutionId}`,
      );

      await this.updateTaskExecution(data.taskExecutionId, {
        status: TASK_EXECUTION_STATUSES.FAILED,
        endedAt: new Date(),
        details: error.message as string,
      });
    }
  }

  async performJobSearchTask({
    userId,
    preferenceId,
    taskExecutionId,
  }: PerformJobSearchTaskParams) {
    const userJobPreference = (
      await db
        .select()
        .from(userJobPreferencesTable)
        .where(eq(userJobPreferencesTable.id, preferenceId))
    )[0];

    const platform = (
      await db
        .select()
        .from(platformsTable)
        .where(eq(platformsTable.id, userJobPreference.platformId as number))
    )[0];

    let jobsDetails: Omit<NewJob, "taskExecutionId">[] = [];

    switch (platform.name) {
      case "linkedin":
        jobsDetails = await this.performLinkedinJobSearchTask({
          userId,
          platformId: userJobPreference.platformId,
          jobTitle: userJobPreference.job,
          city: userJobPreference.city,
          state: userJobPreference.state,
          country: userJobPreference.country,
          onsiteRemoteFilters: {
            remote: userJobPreference.remote,
            hybrid: userJobPreference.hybrid,
            onsite: userJobPreference.onsite,
          },
        });

        break;
      default:
        break;
    }

    await this.saveJobDetails(
      jobsDetails,
      platform.name,
      taskExecutionId,
      userId,
    );
  }

  async performLinkedinJobSearchTask({
    jobTitle,
    city,
    state,
    country,
    onsiteRemoteFilters,
    userId,
    platformId,
  }: PerformLinkedinJobSearchTaskParams) {
    const credentials = (
      await db
        .select()
        .from(credentialsTable)
        .where(
          and(
            eq(credentialsTable.userId, userId),
            eq(credentialsTable.platformId, platformId),
          ),
        )
    )[0];

    const jobsDetails = await Linkedin.handleSearchForJobs({
      userId,
      jobTitle,
      city,
      state,
      country,
      email: decrypt(credentials.email),
      password: decrypt(credentials.password),
      datePostedFilter: "pastWeek", // Need to use db value
      onsiteRemoteFilters: [
        ...((onsiteRemoteFilters.remote
          ? ["remote"]
          : []) as OnsiteRemoteFilterType[]),
        ...((onsiteRemoteFilters.hybrid
          ? ["hybrid"]
          : []) as OnsiteRemoteFilterType[]),
        ...((onsiteRemoteFilters.onsite
          ? ["onsite"]
          : []) as OnsiteRemoteFilterType[]),
      ],
    });

    return jobsDetails.map((job) => ({
      company: job.company,
      companyUrl: job.companyUrl,
      title: job.title,
      url: job.url,
      platformId,
      platformJobId: job.platformJobId,
    }));
  }

  async updateTaskExecution(id: number, values: NewTaskExecution) {
    await db
      .update(taskExecutionsTable)
      .set({ ...values })
      .where(eq(taskExecutionsTable.id, id));
  }

  async saveJobDetails(
    jobsDetails: Omit<NewJob, "taskExecutionId">[],
    platformName: string,
    taskExecutionId: number,
    userId: number,
  ) {
    for (const job of jobsDetails) {
      const savedJob = await this.saveJobToDB(
        job,
        platformName,
        taskExecutionId,
      );

      const savedUserJob = await this.saveUserJobToDB(
        savedJob.id,
        userId,
        job.platformJobId,
        platformName,
      );
    }
  }

  async saveJobToDB(
    job: Omit<NewJob, "taskExecutionId">,
    platformName: string,
    taskExecutionId: number,
  ) {
    const jobAlreadyExists = (
      await db
        .select()
        .from(jobsTable)
        .where(eq(jobsTable.platformJobId, job.platformJobId))
    )[0];

    if (jobAlreadyExists) {
      console.info(
        `[info] ${platformName} job ${job.platformJobId} already exists. continuing...`,
      );
      const savedJob = (
        await db
          .select()
          .from(jobsTable)
          .where(eq(jobsTable.platformJobId, job.platformJobId))
      )[0];

      return savedJob;
    }

    console.info(
      `[info] Saving ${platformName} job ${job.platformJobId} into jobs table...`,
    );

    const savedJob = (
      await db
        .insert(jobsTable)
        .values({ ...job, taskExecutionId })
        .returning()
    )[0];

    console.info(`[info] Save complete.`);
    return savedJob;
  }

  async saveUserJobToDB(
    savedJobId: number,
    userId: number,
    platformJobId,
    platformName: string,
  ) {
    // NEED TO MAKE SURE THE JOB DOES NOT EXIST
    const userJobAlreadyExists = (
      await db
        .select()
        .from(userJobsTable)
        .where(and(eq(userJobsTable.jobId, savedJobId)))
    )[0];

    if (!userJobAlreadyExists) {
      console.info(
        `[info] Saving ${platformName} job ${platformJobId} into user-jobs table...`,
      );
      const userJob = (
        await db
          .insert(userJobsTable)
          .values({
            userId,
            jobId: savedJobId,
            status: USER_JOB_STATUSES.READY,
          })
          .returning()
      )[0];

      return userJob;
    }
  }
}

export { JobSearchWorker };
