import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { jobsTable } from "./jobs";
import { taskExecutionsTable } from "./taskExecutions";
import { usersTable } from "./users";

const userJobsTable = pgTable(
  "user_jobs",
  {
    id: serial("id").primaryKey().notNull(),
    status: text("status").notNull(), // READY APPLYING APPLIED FAILED

    // foreign key
    userId: integer("user_id")
      .references(() => usersTable.id)
      .notNull(),
    jobId: integer("job_id")
      .references(() => jobsTable.id)
      .notNull(),
    taskExecutionId: integer("task_execution_id").references(
      () => taskExecutionsTable.id,
    ),
    // default
    createdAt: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => ({
    unq: unique().on(t.id, t.userId, t.jobId),
  }),
);

type UserJob = typeof userJobsTable.$inferSelect;
type NewUserJob = typeof userJobsTable.$inferInsert;

export { userJobsTable, UserJob, NewUserJob };
