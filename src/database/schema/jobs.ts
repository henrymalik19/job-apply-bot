import { sql } from "drizzle-orm";
import { boolean } from "drizzle-orm/pg-core";
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

const jobs = pgTable("jobs", {
  id: serial("id").primaryKey().notNull(),
  company: text("company").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  descriptionHtml: text("description_html").notNull(),
  url: text("url").notNull(),
  jobBoard: text("job_board").notNull(),
  jobBoardId: text("job_board_id").notNull(),
  wasSuccessful: boolean("was_successful").notNull(),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

type Job = typeof jobs.$inferSelect;
type NewJob = typeof jobs.$inferInsert;

export { jobs, Job, NewJob };
