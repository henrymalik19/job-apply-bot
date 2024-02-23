import { sql } from "drizzle-orm";
import { integer, unique } from "drizzle-orm/pg-core";
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

import { platformsTable } from "./platforms";
// tables
import { usersTable } from "./users";

const credentialsTable = pgTable(
  "credentials",
  {
    id: serial("id").primaryKey().notNull(),
    email: text("email").notNull(),
    password: text("password").notNull(),

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
    unq: unique().on(t.userId, t.platformId),
  }),
);

type Credential = typeof credentialsTable.$inferSelect;
type NewCredential = typeof credentialsTable.$inferInsert;

export { credentialsTable, Credential, NewCredential };
