"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskExecutionsTable = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const taskSchedules_1 = require("./taskSchedules");
const taskExecutionsTable = (0, pg_core_1.pgTable)("task_executions", {
    id: (0, pg_core_1.serial)("id").primaryKey().notNull(),
    status: (0, pg_core_1.text)("status").notNull(), // SUCCESS FAILED IN_PROGRESS
    details: (0, pg_core_1.text)("details"),
    startedAt: (0, pg_core_1.timestamp)("started_at"),
    endedAt: (0, pg_core_1.timestamp)("ended_at"),
    // foreign keys
    scheduleId: (0, pg_core_1.integer)("schedule_id").references(() => taskSchedules_1.taskSchedulesTable.id),
    // default
    createdAt: (0, pg_core_1.timestamp)("created_at")
        .default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`)
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at")
        .default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`)
        .notNull(),
});
exports.taskExecutionsTable = taskExecutionsTable;
