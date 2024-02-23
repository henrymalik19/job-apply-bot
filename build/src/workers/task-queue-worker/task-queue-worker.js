"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskQueueWorker = void 0;
const cron_1 = require("cron");
const drizzle_orm_1 = require("drizzle-orm");
const constants_1 = require("../../constants");
const db_1 = require("../../database/db");
const jobs_1 = require("../../database/schema/jobs");
const taskExecutions_1 = require("../../database/schema/taskExecutions");
const taskSchedules_1 = require("../../database/schema/taskSchedules");
const userJobs_1 = require("../../database/schema/userJobs");
const users_1 = require("../../database/schema/users");
const job_apply_queue_1 = require("../../queues/job-apply-queue");
const job_search_queue_1 = require("../../queues/job-search-queue");
const utils_1 = require("../../utils");
class TaskQueueWorker {
    init() {
        console.info("[info] starting task-queue-worker...");
        const job = new cron_1.CronJob("*/30 * * * * *", () => this.start(), null, null); // ,"America/New_York")
        job.start();
    }
    async start() {
        try {
            console.info("[info] searching for tasks to schedule...");
            const now = new Date();
            const tasksToSchedule = await db_1.db
                .select()
                .from(taskSchedules_1.taskSchedulesTable)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.lte)(taskSchedules_1.taskSchedulesTable.nextRunAt, now), (0, drizzle_orm_1.eq)(taskSchedules_1.taskSchedulesTable.enabled, true)));
            console.info(tasksToSchedule.length === 0
                ? `[info] no new tasks found`
                : `[info] found ${tasksToSchedule.length} task(s)!`);
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
                await db_1.db
                    .update(taskSchedules_1.taskSchedulesTable)
                    .set({
                    nextRunAt: (0, utils_1.getNextDateFromCron)(taskToSchedule.frequency),
                    updatedAt: new Date(),
                })
                    .where((0, drizzle_orm_1.eq)(taskSchedules_1.taskSchedulesTable.id, taskToSchedule.id));
            }
        }
        catch (error) {
            console.log(error);
            console.info("[error] error with task-queue-worker job");
        }
    }
    async pushToJobSearchQueue(taskToSchedule) {
        const taskToExecute = await this.createTaskExecution(taskToSchedule);
        if (!taskToExecute)
            return;
        try {
            console.info(`[info] adding job to the jobSearchQueue...`);
            await job_search_queue_1.jobSearchQueue.add(`user:${taskToSchedule.userId}-schedule:${taskToSchedule.id}-job-search`, {
                taskExecutionId: taskToExecute.id,
                userId: taskToSchedule.userId,
                preferenceId: taskToSchedule.preferenceId,
            });
        }
        catch (error) {
            console.info("[error] error pushing job to jobSearchQueue");
            await db_1.db
                .update(taskExecutions_1.taskExecutionsTable)
                .set({
                status: constants_1.TASK_EXECUTION_STATUSES.FAILED,
                endedAt: new Date(),
                details: error.message,
            })
                .where((0, drizzle_orm_1.eq)(taskExecutions_1.taskExecutionsTable.id, taskToExecute.id));
        }
    }
    async pushToJobApplyQueue(taskToSchedule) {
        let user;
        let jobsToApply;
        try {
            user = (await db_1.db
                .select()
                .from(users_1.usersTable)
                .where((0, drizzle_orm_1.eq)(users_1.usersTable.id, taskToSchedule.userId)))[0];
            jobsToApply = await db_1.db
                .select({ id: userJobs_1.userJobsTable.id, platformId: jobs_1.jobsTable.platformId })
                .from(userJobs_1.userJobsTable)
                .innerJoin(jobs_1.jobsTable, (0, drizzle_orm_1.eq)(jobs_1.jobsTable.id, userJobs_1.userJobsTable.jobId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(userJobs_1.userJobsTable.userId, taskToSchedule.userId), (0, drizzle_orm_1.eq)(userJobs_1.userJobsTable.status, constants_1.USER_JOB_STATUSES.READY)))
                .limit(user.dailyApplicationLimit);
        }
        catch (error) {
            console.info(`[error] error querying database -> pushToApplyJobQueue()`);
            return;
        }
        if (jobsToApply.length === 0) {
            console.info(`[info] no jobs to apply to for user ${taskToSchedule.userId}, continuing...`);
            return;
        }
        for (const jobToApply of jobsToApply) {
            const taskToExecute = await this.createTaskExecution(taskToSchedule);
            if (!taskToExecute)
                return;
            try {
                await db_1.db
                    .update(userJobs_1.userJobsTable)
                    .set({ taskExecutionId: taskToExecute.id })
                    .where((0, drizzle_orm_1.eq)(userJobs_1.userJobsTable.id, jobToApply.id));
                console.info(`[info] adding job to the jobApplyQueue...`);
                await job_apply_queue_1.jobApplyQueue.add(`user:${taskToSchedule.userId}-schedule:${taskToSchedule.id}-user_job:${jobToApply.id}-job-apply`, {
                    taskExecutionId: taskToExecute.id,
                    userJobId: jobToApply.id,
                });
            }
            catch (error) {
                console.info("[error] error pushing job to jobApplyQueue");
                await db_1.db
                    .update(taskExecutions_1.taskExecutionsTable)
                    .set({
                    status: constants_1.TASK_EXECUTION_STATUSES.FAILED,
                    endedAt: new Date(),
                    details: error.message,
                })
                    .where((0, drizzle_orm_1.eq)(taskExecutions_1.taskExecutionsTable.id, taskToExecute.id));
            }
        }
    }
    async createTaskExecution(taskToSchedule) {
        try {
            console.info(`[info] creating an entry in the taskExecutions table...`);
            const taskToExecute = (await db_1.db
                .insert(taskExecutions_1.taskExecutionsTable)
                .values({
                status: constants_1.TASK_EXECUTION_STATUSES.PENDING,
                scheduleId: taskToSchedule.id,
                startedAt: new Date(),
            })
                .returning())[0];
            return taskToExecute;
        }
        catch {
            console.info(`[error] error creating taskExecution entry for task: ${taskToSchedule.id} -> pushToJobSearchQueue()`);
            return null;
        }
    }
}
exports.TaskQueueWorker = TaskQueueWorker;
