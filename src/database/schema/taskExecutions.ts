import { sql } from "drizzle-orm";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

import { taskSchedulesTable } from "./taskSchedules";

const taskExecutionsTable = pgTable("task_executions", {
  id: serial("id").primaryKey().notNull(),
  status: text("status").notNull(), // SUCCESS FAILED IN_PROGRESS
  details: text("details"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),

  // foreign keys
  scheduleId: integer("schedule_id").references(() => taskSchedulesTable.id),

  // default
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

type TaskExecution = typeof taskExecutionsTable.$inferSelect;
type NewTaskExecution = typeof taskExecutionsTable.$inferInsert;

export { taskExecutionsTable, TaskExecution, NewTaskExecution };
