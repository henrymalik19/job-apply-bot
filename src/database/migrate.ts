import { PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { DB_HOST, DB_NAME, DB_PASSWORD, DB_USER } from "../constants";

const client = postgres({
  host: DB_HOST,
  user: DB_USER,
  database: DB_NAME,
  password: DB_PASSWORD,
});
const db: PostgresJsDatabase = drizzle(client);

export { db };

async function runMigrations() {
  console.log("[migrate] starting migration...");
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("[migrate] migration complete!");

  await client.end();
}

runMigrations().catch((err) => console.error(err));
