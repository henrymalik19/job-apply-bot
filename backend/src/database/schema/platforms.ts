import { relations, sql } from "drizzle-orm";
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

import { credentialsTable } from "./credentials";

const platformsTable = pgTable("platforms", {
  id: serial("id").primaryKey().notNull(),
  name: text("name").notNull().unique(),

  // default
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

const platformsTableRelations = relations(platformsTable, ({ many }) => ({
  credentials: many(credentialsTable),
}));

type Platform = typeof platformsTable.$inferSelect;
type NewPlatform = typeof platformsTable.$inferInsert;

export { platformsTable, platformsTableRelations, Platform, NewPlatform };
