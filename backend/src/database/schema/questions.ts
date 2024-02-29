import { sql } from "drizzle-orm";
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

const questions = pgTable("questions", {
  id: serial("id").primaryKey().notNull(),
  question: text("question").notNull(),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

type Question = typeof questions.$inferSelect;
type NewQuestion = typeof questions.$inferInsert;

export { questions, Question, NewQuestion };
