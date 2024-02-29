"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userJobs = exports.userJobPreferences = exports.tasks = exports.taskSchedules = exports.taskExecutions = exports.jobs = exports.platforms = exports.credentials = exports.users = exports.questions = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.questions = (0, pg_core_1.pgTable)("questions", {
    id: (0, pg_core_1.serial)("id").primaryKey().notNull(),
    question: (0, pg_core_1.text)("question").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
});
exports.users = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.serial)("id").primaryKey().notNull(),
    firstName: (0, pg_core_1.text)("first_name").notNull(),
    lastName: (0, pg_core_1.text)("last_name").notNull(),
    dailyApplicationLimit: (0, pg_core_1.integer)("daily_application_limit").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => {
    return {
        usersIdFirstNameLastNameUnique: (0, pg_core_1.unique)("users_id_first_name_last_name_unique").on(table.id, table.firstName, table.lastName),
    };
});
exports.credentials = (0, pg_core_1.pgTable)("credentials", {
    id: (0, pg_core_1.serial)("id").primaryKey().notNull(),
    email: (0, pg_core_1.text)("email").notNull(),
    password: (0, pg_core_1.text)("password").notNull(),
    userId: (0, pg_core_1.integer)("user_id").notNull().references(() => exports.users.id),
    platformId: (0, pg_core_1.integer)("platform_id").notNull().references(() => exports.platforms.id),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => {
    return {
        credentialsUserIdPlatformIdUnique: (0, pg_core_1.unique)("credentials_user_id_platform_id_unique").on(table.userId, table.platformId),
    };
});
exports.platforms = (0, pg_core_1.pgTable)("platforms", {
    id: (0, pg_core_1.serial)("id").primaryKey().notNull(),
    name: (0, pg_core_1.text)("name").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => {
    return {
        platformsNameUnique: (0, pg_core_1.unique)("platforms_name_unique").on(table.name),
    };
});
exports.jobs = (0, pg_core_1.pgTable)("jobs", {
    id: (0, pg_core_1.serial)("id").primaryKey().notNull(),
    company: (0, pg_core_1.text)("company").notNull(),
    companyUrl: (0, pg_core_1.text)("company_url").notNull(),
    title: (0, pg_core_1.text)("title").notNull(),
    url: (0, pg_core_1.text)("url").notNull(),
    platformJobId: (0, pg_core_1.text)("platform_job_id").notNull(),
    platformId: (0, pg_core_1.integer)("platform_id").notNull().references(() => exports.platforms.id),
    taskExecutionId: (0, pg_core_1.integer)("task_execution_id").notNull().references(() => exports.taskExecutions.id),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => {
    return {
        jobsPlatformJobIdUnique: (0, pg_core_1.unique)("jobs_platform_job_id_unique").on(table.platformJobId),
    };
});
exports.taskExecutions = (0, pg_core_1.pgTable)("task_executions", {
    id: (0, pg_core_1.serial)("id").primaryKey().notNull(),
    status: (0, pg_core_1.text)("status").notNull(),
    details: (0, pg_core_1.text)("details"),
    startedAt: (0, pg_core_1.timestamp)("started_at", { mode: 'string' }),
    endedAt: (0, pg_core_1.timestamp)("ended_at", { mode: 'string' }),
    scheduleId: (0, pg_core_1.integer)("schedule_id").references(() => exports.taskSchedules.id),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
});
exports.taskSchedules = (0, pg_core_1.pgTable)("task_schedules", {
    id: (0, pg_core_1.serial)("id").primaryKey().notNull(),
    frequency: (0, pg_core_1.text)("frequency").notNull(),
    nextRunAt: (0, pg_core_1.timestamp)("next_run_at", { mode: 'string' }).defaultNow().notNull(),
    enabled: (0, pg_core_1.boolean)("enabled").default(true).notNull(),
    taskId: (0, pg_core_1.integer)("task_id").notNull().references(() => exports.tasks.id),
    userId: (0, pg_core_1.integer)("user_id").notNull().references(() => exports.users.id),
    preferenceId: (0, pg_core_1.integer)("preference_id").references(() => exports.userJobPreferences.id),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => {
    return {
        taskSchedulesTaskIdUserIdPreferenceIdUnique: (0, pg_core_1.unique)("task_schedules_task_id_user_id_preference_id_unique").on(table.taskId, table.userId, table.preferenceId),
    };
});
exports.tasks = (0, pg_core_1.pgTable)("tasks", {
    id: (0, pg_core_1.serial)("id").primaryKey().notNull(),
    name: (0, pg_core_1.text)("name").notNull(),
    description: (0, pg_core_1.text)("description"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
});
exports.userJobPreferences = (0, pg_core_1.pgTable)("user_job_preferences", {
    id: (0, pg_core_1.serial)("id").primaryKey().notNull(),
    job: (0, pg_core_1.text)("job").notNull(),
    city: (0, pg_core_1.text)("city"),
    state: (0, pg_core_1.text)("state"),
    country: (0, pg_core_1.text)("country").notNull(),
    onsite: (0, pg_core_1.boolean)("onsite").default(true).notNull(),
    remote: (0, pg_core_1.boolean)("remote").default(true).notNull(),
    hybrid: (0, pg_core_1.boolean)("hybrid").default(true).notNull(),
    userId: (0, pg_core_1.integer)("user_id").notNull().references(() => exports.users.id),
    platformId: (0, pg_core_1.integer)("platform_id").notNull().references(() => exports.platforms.id),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => {
    return {
        userJobPreferencesJobCityStateCountryUserIdPlatformId: (0, pg_core_1.unique)("user_job_preferences_job_city_state_country_user_id_platform_id").on(table.job, table.city, table.state, table.country, table.userId, table.platformId),
    };
});
exports.userJobs = (0, pg_core_1.pgTable)("user_jobs", {
    id: (0, pg_core_1.serial)("id").primaryKey().notNull(),
    status: (0, pg_core_1.text)("status").notNull(),
    userId: (0, pg_core_1.integer)("user_id").notNull().references(() => exports.users.id),
    jobId: (0, pg_core_1.integer)("job_id").notNull().references(() => exports.jobs.id),
    taskExecutionId: (0, pg_core_1.integer)("task_execution_id").references(() => exports.taskExecutions.id),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => {
    return {
        userJobsIdUserIdJobIdUnique: (0, pg_core_1.unique)("user_jobs_id_user_id_job_id_unique").on(table.id, table.userId, table.jobId),
    };
});
