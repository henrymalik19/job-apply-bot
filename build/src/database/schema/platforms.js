"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformsTableRelations = exports.platformsTable = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const credentials_1 = require("./credentials");
const platformsTable = (0, pg_core_1.pgTable)("platforms", {
    id: (0, pg_core_1.serial)("id").primaryKey().notNull(),
    name: (0, pg_core_1.text)("name").notNull().unique(),
    // default
    createdAt: (0, pg_core_1.timestamp)("created_at")
        .default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`)
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at")
        .default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`)
        .notNull(),
});
exports.platformsTable = platformsTable;
const platformsTableRelations = (0, drizzle_orm_1.relations)(platformsTable, ({ many }) => ({
    credentials: many(credentials_1.credentialsTable),
}));
exports.platformsTableRelations = platformsTableRelations;
