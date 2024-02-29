"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userJobsTable = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const jobs_1 = require("./jobs");
const taskExecutions_1 = require("./taskExecutions");
const users_1 = require("./users");
const userJobsTable = (0, pg_core_1.pgTable)("user_jobs", {
    id: (0, pg_core_1.serial)("id").primaryKey().notNull(),
    status: (0, pg_core_1.text)("status").notNull(), // READY APPLYING APPLIED FAILED
    // foreign key
    userId: (0, pg_core_1.integer)("user_id")
        .references(() => users_1.usersTable.id)
        .notNull(),
    jobId: (0, pg_core_1.integer)("job_id")
        .references(() => jobs_1.jobsTable.id)
        .notNull(),
    taskExecutionId: (0, pg_core_1.integer)("task_execution_id").references(() => taskExecutions_1.taskExecutionsTable.id),
    // default
    createdAt: (0, pg_core_1.timestamp)("created_at")
        .default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`)
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at")
        .default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`)
        .notNull(),
}, (t) => ({
    unq: (0, pg_core_1.unique)().on(t.id, t.userId, t.jobId),
}));
exports.userJobsTable = userJobsTable;
