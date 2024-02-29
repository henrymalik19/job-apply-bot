"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.questions = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const questions = (0, pg_core_1.pgTable)("questions", {
    id: (0, pg_core_1.serial)("id").primaryKey().notNull(),
    question: (0, pg_core_1.text)("question").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at")
        .default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`)
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at")
        .default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`)
        .notNull(),
});
exports.questions = questions;
