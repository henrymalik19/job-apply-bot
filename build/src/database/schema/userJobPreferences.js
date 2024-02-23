"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userJobPreferencesTable = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const pg_core_2 = require("drizzle-orm/pg-core");
const pg_core_3 = require("drizzle-orm/pg-core");
const platforms_1 = require("./platforms");
// tables
const users_1 = require("./users");
const userJobPreferencesTable = (0, pg_core_2.pgTable)("user_job_preferences", {
    id: (0, pg_core_2.serial)("id").primaryKey().notNull(),
    job: (0, pg_core_2.text)("job").notNull(),
    city: (0, pg_core_2.text)("city"),
    state: (0, pg_core_2.text)("state"),
    country: (0, pg_core_2.text)("country").notNull(),
    onsite: (0, pg_core_3.boolean)("onsite").default(true).notNull(),
    remote: (0, pg_core_3.boolean)("remote").default(true).notNull(),
    hybrid: (0, pg_core_3.boolean)("hybrid").default(true).notNull(),
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
    unq: (0, pg_core_1.unique)().on(t.job, t.city, t.state, t.country, t.userId, t.platformId),
}));
exports.userJobPreferencesTable = userJobPreferencesTable;
