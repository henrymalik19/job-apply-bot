import { Job as BullMqJob, ConnectionOptions, Worker } from "bullmq";

import { TASK_EXECUTION_STATUSES, USER_JOB_STATUSES } from "../../constants";
import { NewJob } from "../../database/schema/jobs";
import { TaskExecution } from "../../database/schema/taskExecutions";
import { Linkedin } from "../../platforms/linkedin/Linkedin";
import {
  DatePostedFilterType,
  OnsiteRemoteFilterType,
} from "../../platforms/linkedin/types";
import { jobSearchQueueName } from "../../queues/job-search-queue";
import { CredentialService } from "../../services/credential";
import { JobService } from "../../services/job";
import { PlatformService } from "../../services/platform";
import { TaskExecutionService } from "../../services/task-execution";
import { UserJobService } from "../../services/user-job";
import { UserJobPreferenceService } from "../../services/user-job-preference";
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
  datePostedFilter: DatePostedFilterType;
  userId: number;
  platformId: number;
}

class JobSearchWorker {
  credentialService: CredentialService;
  jobService: JobService;
  taskExecutionService: TaskExecutionService;
  userJobService: UserJobService;
  userJobPreferenceService: UserJobPreferenceService;
  platformService: PlatformService;

  constructor(
    _credentialService: CredentialService,
    _jobService: JobService,
    _taskExecutionService: TaskExecutionService,
    _userJobService: UserJobService,
    _userJobPreferenceService: UserJobPreferenceService,
    _platformService: PlatformService,
  ) {
    this.credentialService = _credentialService;
    this.jobService = _jobService;
    this.taskExecutionService = _taskExecutionService;
    this.userJobService = _userJobService;
    this.userJobPreferenceService = _userJobPreferenceService;
    this.platformService = _platformService;
  }

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

    let taskExecution: TaskExecution;

    try {
      console.info(`[info] processing job ${job.name}...`);

      taskExecution = await this.taskExecutionService.create({
        status: TASK_EXECUTION_STATUSES.IN_PROGRESS,
        startedAt: new Date(),
      });

      await await this.performJobSearchTask({
        userId: data.userId,
        preferenceId: data.preferenceId,
        taskExecutionId: taskExecution.id,
      });

      await this.taskExecutionService.update(taskExecution.id, {
        status: TASK_EXECUTION_STATUSES.SUCCESS,
        endedAt: new Date(),
      });

      console.info("[info] processing job complete");
    } catch (error: any) {
      console.info(
        `[info] error processing job. Task Execution Id:${taskExecution!.id}`,
      );

      await this.taskExecutionService.update(taskExecution!.id, {
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
    const userJobPreference =
      await this.userJobPreferenceService.findById(preferenceId);
    const platform = await this.platformService.findById(
      userJobPreference.platformId,
    );

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
          datePostedFilter:
            userJobPreference.searchTimeframe as DatePostedFilterType,
        });

        break;
      default:
        break;
    }

    for (const job of jobsDetails) {
      const savedJob = await this.saveJobToDB({ ...job, taskExecutionId });

      const savedUserJob = await this.saveUserJobToDB(
        savedJob.id,
        userId,
        job.platformJobId,
      );
    }
  }

  async performLinkedinJobSearchTask({
    jobTitle,
    city,
    state,
    country,
    onsiteRemoteFilters,
    datePostedFilter,
    userId,
    platformId,
  }: PerformLinkedinJobSearchTaskParams) {
    const credentials = await this.credentialService.findByUserIdAndPlatformId(
      userId,
      platformId,
    );

    const jobsDetails = await Linkedin.handleSearchForJobs({
      userId,
      jobTitle,
      city,
      state,
      country,
      email: decrypt(credentials.email),
      password: decrypt(credentials.password),
      datePostedFilter,
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

  async saveJobToDB(job: NewJob) {
    const jobAlreadyExists = await this.jobService.findByPlatformJobId(
      job.platformJobId,
    );

    if (jobAlreadyExists) {
      console.info(
        `[info] job ${job.platformJobId} already exists. in jobs table, continuing...`,
      );

      return jobAlreadyExists;
    }

    console.info(`[info] Saving job ${job.platformJobId} into jobs table...`);

    const savedJob = await this.jobService.create(job);

    return savedJob;
  }

  async saveUserJobToDB(savedJobId: number, userId: number, platformJobId) {
    const userJobAlreadyExists =
      await this.userJobService.findByJobId(savedJobId);

    if (userJobAlreadyExists) {
      console.info(
        `[info] job ${platformJobId} already exists in user_jobs table, continuing...`,
      );

      return userJobAlreadyExists;
    }

    console.info(`[info] Saving job ${platformJobId} into user_jobs table...`);

    const userJob = await this.userJobService.create({
      userId,
      jobId: savedJobId,
      status: USER_JOB_STATUSES.READY,
    });

    return userJob;
  }
}

export { JobSearchWorker };
