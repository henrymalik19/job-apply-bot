import { eq } from "drizzle-orm";
import { PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  DB_HOST,
  DB_NAME,
  DB_PASSWORD,
  DB_USER,
  TASK_TYPES,
} from "../constants";
import { encrypt } from "../utils";
import { credentialsTable } from "./schema/credentials";
import { platformsTable } from "./schema/platforms";
import { taskSchedulesTable } from "./schema/taskSchedules";
import { tasksTable } from "./schema/tasks";
import { userJobPreferencesTable } from "./schema/userJobPreferences";
import { usersTable } from "./schema/users";
import { setupUser } from "./seedData";

const main = async () => {
  // Create the connection to database
  const client = postgres({
    host: DB_HOST,
    user: DB_USER,
    database: DB_NAME,
    password: DB_PASSWORD,
  });
  const db: PostgresJsDatabase = drizzle(client);

  console.info("[info] seeding database...");

  console.info("[info] adding platforms to platformsTable...");
  await db.insert(platformsTable).values({
    name: "linkedin",
  });
  console.info("[info] completed adding platforms to platformsTable");

  console.info("[info] adding tasks to tasksTable...");
  const tasks = await db
    .insert(tasksTable)
    .values([
      {
        name: TASK_TYPES.JOB_SEARCH,
        description: "job search",
      },
      { name: TASK_TYPES.JOB_APPLY, description: "job apply" },
    ])
    .returning();
  console.info("[info] completed adding tasks to tasksTable");

  console.info("[info] adding users to usersTable...");
  const user = (
    await db
      .insert(usersTable)
      .values({
        firstName: setupUser.firstName,
        lastName: setupUser.lastName,
        dailyApplicationLimit: 5,
      })
      .returning()
  )[0];
  console.info("[info] completed adding users to usersTable");

  console.info("[info] adding credentials to credentialsTable...");
  for (const credential of setupUser.credentials) {
    const platform = (
      await db
        .select()
        .from(platformsTable)
        .where(eq(platformsTable.name, credential.platform))
    )[0];

    await db.insert(credentialsTable).values({
      email: encrypt(credential.email).encryptedData.toString(),
      password: encrypt(credential.password).encryptedData.toString(),
      platformId: platform.id,
      userId: user.id,
    });
  }
  console.info("[info] completed adding credentials to credentialsTable");

  console.info(
    "[info] adding userJobPreferences to userJobPreferencesTable...",
  );
  for (const jobPreference of setupUser.jobPreferences) {
    const platform = (
      await db
        .select()
        .from(platformsTable)
        .where(eq(platformsTable.name, jobPreference.platform))
    )[0];

    const userJobPreferences = await db
      .insert(userJobPreferencesTable)
      .values({
        userId: user.id,
        platformId: platform.id,
        job: jobPreference.job,
        city: jobPreference.city,
        state: jobPreference.state,
        country: jobPreference.country,
        remote: jobPreference.remote,
      })
      .returning();
    console.info(
      "[info] completed adding userJobPreferences to userJobPreferencesTable",
    );

    console.info("[info] adding taskSchedules to taskSchedulesTable...");
    for (const jobPreference of userJobPreferences) {
      const searchTask = tasks.find((t) => t.name === "Job Search");

      await db.insert(taskSchedulesTable).values({
        frequency: "0 */20 * * * *",
        taskId: searchTask?.id as number,
        userId: user.id,
        preferenceId: jobPreference.id,
      });
    }
    console.info("[info] completed adding taskSchedules to taskSchedulesTable");
  }

  const applyTask = tasks.find((t) => t.name === "Job Apply");
  await db.insert(taskSchedulesTable).values({
    frequency: "0 */20 * * * *",
    taskId: applyTask?.id as number,
    userId: user.id,
  });
  console.info("[info] completed seeding database");

  await client.end();
};

main();
