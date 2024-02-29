import { ConnectionOptions, Job, Worker } from "bullmq";
// import { chromium } from "playwright";
import { chromium } from "playwright-extra";

import {
  PLATFORMS,
  TASK_EXECUTION_STATUSES,
  USER_JOB_STATUSES,
} from "../../constants";
import { TaskExecution } from "../../database/schema/taskExecutions";
import { Linkedin } from "../../platforms/linkedin/Linkedin";
import { jobApplyQueueName } from "../../queues/job-apply-queue";
import { CredentialService } from "../../services/credential";
import { JobService } from "../../services/job";
import { PlatformService } from "../../services/platform";
import { TaskExecutionService } from "../../services/task-execution";
import { UserJobService } from "../../services/user-job";
import { UserJobPreferenceService } from "../../services/user-job-preference";
import { JobApplyQueueJob } from "../../types";
import { decrypt } from "../../utils";

class JobApplyWorker {
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
    console.info("[info] starting job-apply-worker...");
    console.info("[info] waiting for jobs...");

    new Worker(jobApplyQueueName, (job) => this.processQueue(job), {
      connection,
    });
  }

  private async processQueue(job: Job<JobApplyQueueJob>) {
    console.info("[info] new job received!");
    const { data } = job;

    let taskExecution: TaskExecution;

    try {
      console.info(`[info] processing job ${job.name}...`);

      taskExecution = await this.taskExecutionService.create({
        status: TASK_EXECUTION_STATUSES.IN_PROGRESS,
        startedAt: new Date(),
      });

      await this.performJobApplyTask(data.userJobId);

      await this.taskExecutionService.update(taskExecution.id, {
        status: TASK_EXECUTION_STATUSES.SUCCESS,
        endedAt: new Date(),
      });

      console.info("[info] processing job complete");
    } catch (error: any) {
      console.info(
        `[info] error processing job. Task Execution Id:${taskExecution!.id}`,
      );

      await this.userJobService.update(data.userJobId, {
        status: USER_JOB_STATUSES.FAILED,
      });
      await this.taskExecutionService.update(taskExecution!.id, {
        status: TASK_EXECUTION_STATUSES.FAILED,
        endedAt: new Date(),
        details: error.message as string,
      });
    }
  }

  async performJobApplyTask(userJobId: number) {
    const userJob = await this.userJobService.findById(userJobId);
    await this.userJobService.update(userJob.id, {
      status: USER_JOB_STATUSES.APPLYING,
    });

    const job = await this.jobService.findById(userJob.jobId);
    const platform = await this.platformService.findById(job.platformId);
    const credentials = await this.credentialService.findByUserIdAndPlatformId(
      userJob.userId,
      platform.id,
    );

    switch (platform.name) {
      case PLATFORMS.linkedin:
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

    this.userJobService.update(userJobId, {
      status: USER_JOB_STATUSES.APPLIED,
    });
  }
}

export { JobApplyWorker };
