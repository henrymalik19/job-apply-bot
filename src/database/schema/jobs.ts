import { sql } from "drizzle-orm";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

import { platformsTable } from "./platforms";
import { taskExecutionsTable } from "./taskExecutions";

const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey().notNull(),
  company: text("company").notNull(),
  companyUrl: text("company_url").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  platformJobId: text("platform_job_id").notNull().unique(),

  // foreign keys
  platformId: integer("platform_id")
    .notNull()
    .references(() => platformsTable.id),
  taskExecutionId: integer("task_execution_id")
    .notNull()
    .references(() => taskExecutionsTable.id),
  // postedAt: timestamp("posted_at")
  //   .default(sql`CURRENT_TIMESTAMP`)
  //   .notNull(),

  // default
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

type Job = typeof jobsTable.$inferSelect;
type NewJob = typeof jobsTable.$inferInsert;

export { jobsTable, Job, NewJob };
