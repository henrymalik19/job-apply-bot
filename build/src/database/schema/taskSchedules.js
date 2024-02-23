"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskSchedulesTable = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const tasks_1 = require("./tasks");
const userJobPreferences_1 = require("./userJobPreferences");
const users_1 = require("./users");
const taskSchedulesTable = (0, pg_core_1.pgTable)("task_schedules", {
    id: (0, pg_core_1.serial)("id").primaryKey().notNull(),
    frequency: (0, pg_core_1.text)("frequency").notNull(),
    nextRunAt: (0, pg_core_1.timestamp)("next_run_at")
        .default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`)
        .notNull(),
    enabled: (0, pg_core_1.boolean)("enabled").default(true).notNull(),
    // foreign keys
    taskId: (0, pg_core_1.integer)("task_id")
        .references(() => tasks_1.tasksTable.id)
        .notNull(),
    userId: (0, pg_core_1.integer)("user_id")
        .references(() => users_1.usersTable.id)
        .notNull(),
    preferenceId: (0, pg_core_1.integer)("preference_id").references(() => userJobPreferences_1.userJobPreferencesTable.id),
    // default
    createdAt: (0, pg_core_1.timestamp)("created_at")
        .default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`)
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at")
        .default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`)
        .notNull(),
}, (t) => ({
    unq: (0, pg_core_1.unique)().on(t.taskId, t.userId, t.preferenceId),
}));
exports.taskSchedulesTable = taskSchedulesTable;
