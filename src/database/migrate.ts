import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const client = postgres({
  host: "localhost",
  user: "postgres",
  database: "job-apply-bot",
  password: "test1234!",
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
