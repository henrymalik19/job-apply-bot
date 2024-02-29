"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersTable = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const pg_core_2 = require("drizzle-orm/pg-core");
const usersTable = (0, pg_core_2.pgTable)("users", {
    id: (0, pg_core_2.serial)("id").primaryKey().notNull(),
    firstName: (0, pg_core_2.text)("first_name").notNull(),
    lastName: (0, pg_core_2.text)("last_name").notNull(),
    dailyApplicationLimit: (0, pg_core_1.integer)("daily_application_limit").notNull(),
    // default
    createdAt: (0, pg_core_2.timestamp)("created_at")
        .default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`)
        .notNull(),
    updatedAt: (0, pg_core_2.timestamp)("updated_at")
        .default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`)
        .notNull(),
}, (t) => ({
    unq: (0, pg_core_2.unique)().on(t.id, t.firstName, t.lastName),
}));
exports.usersTable = usersTable;
