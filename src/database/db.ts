import { PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Create the connection to database
const client = postgres({
  host: "localhost",
  user: "postgres",
  database: "job-apply-bot",
  password: "test1234!",
});
const db: PostgresJsDatabase = drizzle(client);

export { db };
