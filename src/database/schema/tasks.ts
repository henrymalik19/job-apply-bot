import { sql } from "drizzle-orm";
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey().notNull(),
  name: text("name").notNull(),
  description: text("description"),

  // default
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

type Task = typeof tasksTable.$inferSelect;
type NewTask = typeof tasksTable.$inferInsert;

export { tasksTable, Task, NewTask };
