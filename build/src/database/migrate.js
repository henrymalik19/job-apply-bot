"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const postgres_js_1 = require("drizzle-orm/postgres-js");
const migrator_1 = require("drizzle-orm/postgres-js/migrator");
const postgres_1 = __importDefault(require("postgres"));
const client = (0, postgres_1.default)({
    host: "localhost",
    user: "postgres",
    database: "job-apply-bot",
    password: "test1234!",
});
const db = (0, postgres_js_1.drizzle)(client);
exports.db = db;
async function runMigrations() {
    console.log("[migrate] starting migration...");
    await (0, migrator_1.migrate)(db, { migrationsFolder: "drizzle" });
    console.log("[migrate] migration complete!");
    await client.end();
}
runMigrations().catch((err) => console.error(err));
