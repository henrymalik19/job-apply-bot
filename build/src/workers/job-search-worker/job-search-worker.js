"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobSearchWorker = void 0;
const bullmq_1 = require("bullmq");
const drizzle_orm_1 = require("drizzle-orm");
const constants_1 = require("../../constants");
const db_1 = require("../../database/db");
const credentials_1 = require("../../database/schema/credentials");
const jobs_1 = require("../../database/schema/jobs");
const platforms_1 = require("../../database/schema/platforms");
const taskExecutions_1 = require("../../database/schema/taskExecutions");
const userJobPreferences_1 = require("../../database/schema/userJobPreferences");
const userJobs_1 = require("../../database/schema/userJobs");
const Linkedin_1 = require("../../platforms/linkedin/Linkedin");
const job_search_queue_1 = require("../../queues/job-search-queue");
const utils_1 = require("../../utils");
class JobSearchWorker {
    init(connection) {
        console.info("[info] starting job-search-worker...");
        console.info("[info] waiting for jobs...");
        new bullmq_1.Worker(job_search_queue_1.jobSearchQueueName, (job) => this.processQueue(job), {
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
            await this.performJobSearchTask({
                userId: data.userId,
                preferenceId: data.preferenceId,
                taskExecutionId: data.taskExecutionId,
            });
            await this.updateTaskExecution(data.taskExecutionId, {
                status: constants_1.TASK_EXECUTION_STATUSES.SUCCESS,
                endedAt: new Date(),
            });
            console.info("[info] processing job complete");
        }
        catch (error) {
            console.info("[info] error processing job");
            await this.updateTaskExecution(data.taskExecutionId, {
                status: constants_1.TASK_EXECUTION_STATUSES.FAILED,
                endedAt: new Date(),
                details: error.message,
            });
        }
    }
    async performJobSearchTask({ userId, preferenceId, taskExecutionId, }) {
        const userJobPreference = (await db_1.db
            .select()
            .from(userJobPreferences_1.userJobPreferencesTable)
            .where((0, drizzle_orm_1.eq)(userJobPreferences_1.userJobPreferencesTable.id, preferenceId)))[0];
        const platform = (await db_1.db
            .select()
            .from(platforms_1.platformsTable)
            .where((0, drizzle_orm_1.eq)(platforms_1.platformsTable.id, userJobPreference.platformId)))[0];
        let jobsDetails = [];
        switch (platform.name) {
            case "linkedin":
                jobsDetails = await this.performLinkedinJobSearchTask({
                    userId,
                    platformId: userJobPreference.platformId,
                    jobTitle: userJobPreference.job,
                    city: userJobPreference.city,
                    state: userJobPreference.state,
                    country: userJobPreference.country,
                });
                break;
            default:
                break;
        }
        await this.saveJobDetails(jobsDetails, platform.name, taskExecutionId, userId);
    }
    async performLinkedinJobSearchTask({ jobTitle, city, state, country, userId, platformId, }) {
        const credentials = (await db_1.db
            .select()
            .from(credentials_1.credentialsTable)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(credentials_1.credentialsTable.userId, userId), (0, drizzle_orm_1.eq)(credentials_1.credentialsTable.platformId, platformId))))[0];
        const jobsDetails = await Linkedin_1.Linkedin.handleSearchForJobs({
            userId,
            jobTitle,
            city,
            state,
            country,
            email: (0, utils_1.decrypt)(credentials.email),
            password: (0, utils_1.decrypt)(credentials.password),
            datePostedFilter: "past24Hours", // Need to use db value
            onsiteRemoteFilter: "remote", // Need to use db value
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
    async updateTaskExecution(id, values) {
        await db_1.db
            .update(taskExecutions_1.taskExecutionsTable)
            .set({ ...values })
            .where((0, drizzle_orm_1.eq)(taskExecutions_1.taskExecutionsTable.id, id));
    }
    async saveJobDetails(jobsDetails, platformName, taskExecutionId, userId) {
        for (const job of jobsDetails) {
            const savedJob = await this.saveJobToDB(job, platformName, taskExecutionId);
            await this.saveUserJobToDB(savedJob.id, userId, platformName);
        }
    }
    async saveJobToDB(job, platformName, taskExecutionId) {
        const jobAlreadyExists = (await db_1.db
            .select()
            .from(jobs_1.jobsTable)
            .where((0, drizzle_orm_1.eq)(jobs_1.jobsTable.platformJobId, job.platformJobId)))[0];
        if (jobAlreadyExists) {
            console.info(`[info] ${platformName} job ${job.platformJobId} already exists. continuing...`);
            const savedJob = (await db_1.db
                .select()
                .from(jobs_1.jobsTable)
                .where((0, drizzle_orm_1.eq)(jobs_1.jobsTable.platformJobId, job.platformJobId)))[0];
            return savedJob;
        }
        console.info(`[info] Saving ${platformName} job ${job.platformJobId} into db...`);
        const savedJob = (await db_1.db
            .insert(jobs_1.jobsTable)
            .values({ ...job, taskExecutionId })
            .returning())[0];
        console.info(`[info] Save complete.`);
        return savedJob;
    }
    async saveUserJobToDB(savedJobId, userId, platformName) {
        // NEED TO MAKE SURE THE JOB DOES NOT EXIST
        const userJobAlreadyExists = (await db_1.db
            .select()
            .from(userJobs_1.userJobsTable)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(userJobs_1.userJobsTable.jobId, savedJobId))))[0];
        if (!userJobAlreadyExists) {
            console.info(`[info] Saving ${platformName} job into user-applied-jobs table...`);
            await db_1.db.insert(userJobs_1.userJobsTable).values({
                userId,
                jobId: savedJobId,
                status: constants_1.USER_JOB_STATUSES.READY,
            });
        }
    }
}
exports.JobSearchWorker = JobSearchWorker;
