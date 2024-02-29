"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobApplyWorker = void 0;
const bullmq_1 = require("bullmq");
const drizzle_orm_1 = require("drizzle-orm");
const constants_1 = require("../../constants");
const db_1 = require("../../database/db");
const credentials_1 = require("../../database/schema/credentials");
const jobs_1 = require("../../database/schema/jobs");
const platforms_1 = require("../../database/schema/platforms");
const taskExecutions_1 = require("../../database/schema/taskExecutions");
const userJobs_1 = require("../../database/schema/userJobs");
const Linkedin_1 = require("../../platforms/linkedin/Linkedin");
const job_apply_queue_1 = require("../../queues/job-apply-queue");
const utils_1 = require("../../utils");
class JobApplyWorker {
    init(connection) {
        console.info("[info] starting job-apply-worker...");
        console.info("[info] waiting for jobs...");
        new bullmq_1.Worker(job_apply_queue_1.jobApplyQueueName, (job) => this.processQueue(job), {
            connection,
        });
    }
    async processQueue(job) {
        console.info("[info] new job received!");
        const { data } = job;
        try {
            console.info(`[info] processing job ${job.name}...`);
            await this.updateTaskExecution(data.taskExecutionId, {
                status: constants_1.TASK_EXECUTION_STATUSES.IN_PROGRESS,
                startedAt: new Date(),
            });
            await this.performJobApplyTask(data.userJobId);
            await this.updateTaskExecution(data.taskExecutionId, {
                status: constants_1.TASK_EXECUTION_STATUSES.SUCCESS,
                endedAt: new Date(),
            });
            console.info("[info] processing job complete");
        }
        catch (error) {
            console.info("[info] error processing job");
            await db_1.db
                .update(userJobs_1.userJobsTable)
                .set({ status: constants_1.USER_JOB_STATUSES.FAILED })
                .where((0, drizzle_orm_1.eq)(userJobs_1.userJobsTable.id, data.userJobId));
            await this.updateTaskExecution(data.taskExecutionId, {
                status: constants_1.TASK_EXECUTION_STATUSES.FAILED,
                endedAt: new Date(),
                details: error.message,
            });
        }
    }
    async performJobApplyTask(userJobId) {
        const userJob = (await db_1.db
            .select()
            .from(userJobs_1.userJobsTable)
            .where((0, drizzle_orm_1.eq)(userJobs_1.userJobsTable.id, userJobId)))[0];
        await db_1.db
            .update(userJobs_1.userJobsTable)
            .set({
            status: constants_1.USER_JOB_STATUSES.APPLYING,
        })
            .where((0, drizzle_orm_1.eq)(userJobs_1.userJobsTable.id, userJob.id));
        const job = (await db_1.db.select().from(jobs_1.jobsTable).where((0, drizzle_orm_1.eq)(jobs_1.jobsTable.id, userJob.jobId)))[0];
        const platform = (await db_1.db
            .select()
            .from(platforms_1.platformsTable)
            .where((0, drizzle_orm_1.eq)(platforms_1.platformsTable.id, job.platformId)))[0];
        const credentials = (await db_1.db
            .select()
            .from(credentials_1.credentialsTable)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(credentials_1.credentialsTable.userId, userJob.userId))))[0];
        switch (platform.name) {
            case "linkedin":
                await Linkedin_1.Linkedin.handleApplyForJobs({
                    userId: userJob.userId,
                    jobUrl: job.url,
                    email: (0, utils_1.decrypt)(credentials.email),
                    password: (0, utils_1.decrypt)(credentials.email),
                });
                break;
            default:
                break;
        }
        await db_1.db
            .update(userJobs_1.userJobsTable)
            .set({
            status: constants_1.USER_JOB_STATUSES.APPLIED,
        })
            .where((0, drizzle_orm_1.eq)(userJobs_1.userJobsTable.id, userJob.id));
    }
    async updateTaskExecution(id, values) {
        await db_1.db
            .update(taskExecutions_1.taskExecutionsTable)
            .set({ ...values })
            .where((0, drizzle_orm_1.eq)(taskExecutions_1.taskExecutionsTable.id, id));
    }
}
exports.JobApplyWorker = JobApplyWorker;
