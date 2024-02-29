import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { tasksTable } from "./tasks";
import { userJobPreferencesTable } from "./userJobPreferences";
import { usersTable } from "./users";

const taskSchedulesTable = pgTable(
  "task_schedules",
  {
    id: serial("id").primaryKey().notNull(),
    frequency: text("frequency").notNull(),
    nextRunAt: timestamp("next_run_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    enabled: boolean("enabled").default(true).notNull(),

    // foreign keys
    taskId: integer("task_id")
      .references(() => tasksTable.id)
      .notNull(),
    userId: integer("user_id")
      .references(() => usersTable.id)
      .notNull(),
    preferenceId: integer("preference_id").references(
      () => userJobPreferencesTable.id,
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
    unq: unique().on(t.taskId, t.userId, t.preferenceId),
  }),
);

type TaskSchedule = typeof taskSchedulesTable.$inferSelect;
type NewTaskSchedule = typeof taskSchedulesTable.$inferInsert;

export { taskSchedulesTable, TaskSchedule, NewTaskSchedule };
