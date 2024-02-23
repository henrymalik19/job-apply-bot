"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobsTable = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const platforms_1 = require("./platforms");
const taskExecutions_1 = require("./taskExecutions");
const jobsTable = (0, pg_core_1.pgTable)("jobs", {
    id: (0, pg_core_1.serial)("id").primaryKey().notNull(),
    company: (0, pg_core_1.text)("company").notNull(),
    companyUrl: (0, pg_core_1.text)("company_url").notNull(),
    title: (0, pg_core_1.text)("title").notNull(),
    url: (0, pg_core_1.text)("url").notNull(),
    platformJobId: (0, pg_core_1.text)("platform_job_id").notNull().unique(),
    // foreign keys
    platformId: (0, pg_core_1.integer)("platform_id")
        .notNull()
        .references(() => platforms_1.platformsTable.id),
    taskExecutionId: (0, pg_core_1.integer)("task_execution_id")
        .notNull()
        .references(() => taskExecutions_1.taskExecutionsTable.id),
    // postedAt: timestamp("posted_at")
    //   .default(sql`CURRENT_TIMESTAMP`)
    //   .notNull(),
    // default
    createdAt: (0, pg_core_1.timestamp)("created_at")
        .default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`)
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at")
        .default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`)
        .notNull(),
});
exports.jobsTable = jobsTable;
