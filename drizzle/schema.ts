import { pgTable, serial, text, timestamp, unique, integer, foreignKey, boolean } from "drizzle-orm/pg-core"
  import { sql } from "drizzle-orm"



export const questions = pgTable("questions", {
	id: serial("id").primaryKey().notNull(),
	question: text("question").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const users = pgTable("users", {
	id: serial("id").primaryKey().notNull(),
	firstName: text("first_name").notNull(),
	lastName: text("last_name").notNull(),
	dailyApplicationLimit: integer("daily_application_limit").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		usersIdFirstNameLastNameUnique: unique("users_id_first_name_last_name_unique").on(table.id, table.firstName, table.lastName),
	}
});

export const credentials = pgTable("credentials", {
	id: serial("id").primaryKey().notNull(),
	email: text("email").notNull(),
	password: text("password").notNull(),
	userId: integer("user_id").notNull().references(() => users.id),
	platformId: integer("platform_id").notNull().references(() => platforms.id),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		credentialsUserIdPlatformIdUnique: unique("credentials_user_id_platform_id_unique").on(table.userId, table.platformId),
	}
});

export const platforms = pgTable("platforms", {
	id: serial("id").primaryKey().notNull(),
	name: text("name").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		platformsNameUnique: unique("platforms_name_unique").on(table.name),
	}
});

export const jobs = pgTable("jobs", {
	id: serial("id").primaryKey().notNull(),
	company: text("company").notNull(),
	companyUrl: text("company_url").notNull(),
	title: text("title").notNull(),
	url: text("url").notNull(),
	platformJobId: text("platform_job_id").notNull(),
	platformId: integer("platform_id").notNull().references(() => platforms.id),
	taskExecutionId: integer("task_execution_id").notNull().references(() => taskExecutions.id),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		jobsPlatformJobIdUnique: unique("jobs_platform_job_id_unique").on(table.platformJobId),
	}
});

export const taskExecutions = pgTable("task_executions", {
	id: serial("id").primaryKey().notNull(),
	status: text("status").notNull(),
	details: text("details"),
	startedAt: timestamp("started_at", { mode: 'string' }),
	endedAt: timestamp("ended_at", { mode: 'string' }),
	scheduleId: integer("schedule_id").references(() => taskSchedules.id),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const taskSchedules = pgTable("task_schedules", {
	id: serial("id").primaryKey().notNull(),
	frequency: text("frequency").notNull(),
	nextRunAt: timestamp("next_run_at", { mode: 'string' }).defaultNow().notNull(),
	enabled: boolean("enabled").default(true).notNull(),
	taskId: integer("task_id").notNull().references(() => tasks.id),
	userId: integer("user_id").notNull().references(() => users.id),
	preferenceId: integer("preference_id").references(() => userJobPreferences.id),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		taskSchedulesTaskIdUserIdPreferenceIdUnique: unique("task_schedules_task_id_user_id_preference_id_unique").on(table.taskId, table.userId, table.preferenceId),
	}
});

export const tasks = pgTable("tasks", {
	id: serial("id").primaryKey().notNull(),
	name: text("name").notNull(),
	description: text("description"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const userJobPreferences = pgTable("user_job_preferences", {
	id: serial("id").primaryKey().notNull(),
	job: text("job").notNull(),
	city: text("city"),
	state: text("state"),
	country: text("country").notNull(),
	onsite: boolean("onsite").default(true).notNull(),
	remote: boolean("remote").default(true).notNull(),
	hybrid: boolean("hybrid").default(true).notNull(),
	userId: integer("user_id").notNull().references(() => users.id),
	platformId: integer("platform_id").notNull().references(() => platforms.id),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		userJobPreferencesJobCityStateCountryUserIdPlatformId: unique("user_job_preferences_job_city_state_country_user_id_platform_id").on(table.job, table.city, table.state, table.country, table.userId, table.platformId),
	}
});

export const userJobs = pgTable("user_jobs", {
	id: serial("id").primaryKey().notNull(),
	status: text("status").notNull(),
	userId: integer("user_id").notNull().references(() => users.id),
	jobId: integer("job_id").notNull().references(() => jobs.id),
	taskExecutionId: integer("task_execution_id").references(() => taskExecutions.id),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		userJobsIdUserIdJobIdUnique: unique("user_jobs_id_user_id_job_id_unique").on(table.id, table.userId, table.jobId),
	}
});