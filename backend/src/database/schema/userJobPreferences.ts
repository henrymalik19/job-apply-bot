import { sql } from "drizzle-orm";
import { integer, unique } from "drizzle-orm/pg-core";
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { boolean } from "drizzle-orm/pg-core";

import { platformsTable } from "./platforms";
// tables
import { usersTable } from "./users";

const userJobPreferencesTable = pgTable(
  "user_job_preferences",
  {
    id: serial("id").primaryKey().notNull(),
    job: text("job").notNull(),
    city: text("city"),
    state: text("state"),
    country: text("country").notNull(),
    onsite: boolean("onsite").default(true).notNull(),
    remote: boolean("remote").default(true).notNull(),
    hybrid: boolean("hybrid").default(true).notNull(),
    searchTimeframe: text("search_timeframe").default("past24Hours").notNull(),

    // foreign keys
    userId: integer("user_id")
      .references(() => usersTable.id)
      .notNull(),
    platformId: integer("platform_id")
      .references(() => platformsTable.id)
      .notNull(),

    // default
    createdAt: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => ({
    unq: unique().on(t.job, t.city, t.state, t.country, t.userId, t.platformId),
  }),
);

type UserJobPreference = typeof userJobPreferencesTable.$inferSelect;
type NewUserJobPreference = typeof userJobPreferencesTable.$inferInsert;

export { userJobPreferencesTable, UserJobPreference, NewUserJobPreference };
