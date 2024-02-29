import { PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { DB_HOST, DB_NAME, DB_PASSWORD, DB_USER } from "../constants";

// Create the connection to database
const client = postgres({
  host: DB_HOST,
  user: DB_USER,
  database: DB_NAME,
  password: DB_PASSWORD,
});
const db: PostgresJsDatabase = drizzle(client);

export { db };
