import { sql } from "drizzle-orm";
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

const jobSearchesTable = pgTable("job_searches", {
  id: serial("id").primaryKey().notNull(),
  status: text("status").notNull(),

  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),

  // default
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

type JobSearch = typeof jobSearchesTable.$inferSelect;
type NewJobSearch = typeof jobSearchesTable.$inferInsert;

export { jobSearchesTable, JobSearch, NewJobSearch };
