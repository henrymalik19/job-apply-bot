import { sql } from "drizzle-orm";
import { integer } from "drizzle-orm/pg-core";
import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey().notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    dailyApplicationLimit: integer("daily_application_limit").notNull(),

    // default
    createdAt: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => ({
    unq: unique().on(t.id, t.firstName, t.lastName),
  }),
);

type User = typeof usersTable.$inferSelect;
type NewUser = typeof usersTable.$inferInsert;

export { usersTable, User, NewUser };
