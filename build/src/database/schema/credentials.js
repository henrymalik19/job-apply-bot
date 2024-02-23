"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.credentialsTable = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const pg_core_2 = require("drizzle-orm/pg-core");
const platforms_1 = require("./platforms");
// tables
const users_1 = require("./users");
const credentialsTable = (0, pg_core_2.pgTable)("credentials", {
    id: (0, pg_core_2.serial)("id").primaryKey().notNull(),
    email: (0, pg_core_2.text)("email").notNull(),
    password: (0, pg_core_2.text)("password").notNull(),
    // foreign keys
    userId: (0, pg_core_1.integer)("user_id")
        .references(() => users_1.usersTable.id)
        .notNull(),
    platformId: (0, pg_core_1.integer)("platform_id")
        .references(() => platforms_1.platformsTable.id)
        .notNull(),
    // default
    createdAt: (0, pg_core_2.timestamp)("created_at")
        .default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`)
        .notNull(),
    updatedAt: (0, pg_core_2.timestamp)("updated_at")
        .default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`)
        .notNull(),
}, (t) => ({
    unq: (0, pg_core_1.unique)().on(t.userId, t.platformId),
}));
exports.credentialsTable = credentialsTable;
