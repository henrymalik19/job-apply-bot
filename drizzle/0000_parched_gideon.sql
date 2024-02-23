CREATE TABLE IF NOT EXISTS "credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"user_id" integer NOT NULL,
	"platform_id" integer NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "credentials_user_id_platform_id_unique" UNIQUE("user_id","platform_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"company_url" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"platform_job_id" text NOT NULL,
	"platform_id" integer NOT NULL,
	"task_execution_id" integer NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "jobs_platform_job_id_unique" UNIQUE("platform_job_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platforms" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "platforms_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"details" text,
	"started_at" timestamp,
	"ended_at" timestamp,
	"found_jobs" integer DEFAULT 0,
	"schedule_id" integer,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"frequency" text NOT NULL,
	"next_run_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"task_id" integer NOT NULL,
	"user_id" integer,
	"preference_id" integer,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "task_schedules_task_id_user_id_preference_id_unique" UNIQUE("task_id","user_id","preference_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_job_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"city" text NOT NULL,
	"state" text,
	"country" text NOT NULL,
	"onsite" boolean DEFAULT true NOT NULL,
	"remote" boolean DEFAULT true NOT NULL,
	"hybrid" boolean DEFAULT true NOT NULL,
	"user_id" integer NOT NULL,
	"platform_id" integer NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "user_job_preferences_job_city_state_country_user_id_platform_id_unique" UNIQUE("job","city","state","country","user_id","platform_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"user_id" integer,
	"job_id" integer,
	"task_execution_id" integer NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "user_jobs_id_user_id_job_id_unique" UNIQUE("id","user_id","job_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"daily_application_limit" integer NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "users_id_first_name_last_name_unique" UNIQUE("id","first_name","last_name")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credentials" ADD CONSTRAINT "credentials_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jobs" ADD CONSTRAINT "jobs_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jobs" ADD CONSTRAINT "jobs_task_execution_id_task_executions_id_fk" FOREIGN KEY ("task_execution_id") REFERENCES "task_executions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_executions" ADD CONSTRAINT "task_executions_schedule_id_task_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "task_schedules"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_schedules" ADD CONSTRAINT "task_schedules_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_schedules" ADD CONSTRAINT "task_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_schedules" ADD CONSTRAINT "task_schedules_preference_id_user_job_preferences_id_fk" FOREIGN KEY ("preference_id") REFERENCES "user_job_preferences"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_job_preferences" ADD CONSTRAINT "user_job_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_job_preferences" ADD CONSTRAINT "user_job_preferences_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_jobs" ADD CONSTRAINT "user_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_jobs" ADD CONSTRAINT "user_jobs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_jobs" ADD CONSTRAINT "user_jobs_task_execution_id_task_executions_id_fk" FOREIGN KEY ("task_execution_id") REFERENCES "task_executions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
