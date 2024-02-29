"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const drizzle_orm_1 = require("drizzle-orm");
const postgres_js_1 = require("drizzle-orm/postgres-js");
const postgres_1 = __importDefault(require("postgres"));
const utils_1 = require("../utils");
const credentials_1 = require("./schema/credentials");
const platforms_1 = require("./schema/platforms");
const taskSchedules_1 = require("./schema/taskSchedules");
const tasks_1 = require("./schema/tasks");
const userJobPreferences_1 = require("./schema/userJobPreferences");
const users_1 = require("./schema/users");
const seedData_1 = require("./seedData");
// Create the connection to database
const client = (0, postgres_1.default)({
    host: "localhost",
    user: "postgres",
    database: "job-apply-bot",
    password: "test1234!",
});
const db = (0, postgres_js_1.drizzle)(client);
const main = async () => {
    console.info("[info] seeding database...");
    console.info("[info] adding platforms to platformsTable...");
    await db.insert(platforms_1.platformsTable).values({
        name: "linkedin",
    });
    console.info("[info] completed adding platforms to platformsTable");
    console.info("[info] adding tasks to tasksTable...");
    const tasks = await db
        .insert(tasks_1.tasksTable)
        .values([
        {
            name: "Job Search",
            description: "job search",
        },
        { name: "Job Apply", description: "job apply" },
    ])
        .returning();
    console.info("[info] completed adding tasks to tasksTable");
    console.info("[info] adding users to usersTable...");
    const user = (await db
        .insert(users_1.usersTable)
        .values({
        firstName: seedData_1.setupUser.firstName,
        lastName: seedData_1.setupUser.lastName,
        dailyApplicationLimit: 5,
    })
        .returning())[0];
    console.info("[info] completed adding users to usersTable");
    console.info("[info] adding credentials to credentialsTable...");
    for (const credential of seedData_1.setupUser.credentials) {
        const platform = (await db
            .select()
            .from(platforms_1.platformsTable)
            .where((0, drizzle_orm_1.eq)(platforms_1.platformsTable.name, credential.platform)))[0];
        await db.insert(credentials_1.credentialsTable).values({
            email: (0, utils_1.encrypt)(credential.email).encryptedData.toString(),
            password: (0, utils_1.encrypt)(credential.password).encryptedData.toString(),
            platformId: platform.id,
            userId: user.id,
        });
    }
    console.info("[info] completed adding credentials to credentialsTable");
    console.info("[info] adding userJobPreferences to userJobPreferencesTable...");
    for (const jobPreference of seedData_1.setupUser.jobPreferences) {
        const platform = (await db
            .select()
            .from(platforms_1.platformsTable)
            .where((0, drizzle_orm_1.eq)(platforms_1.platformsTable.name, jobPreference.platform)))[0];
        const userJobPreferences = await db
            .insert(userJobPreferences_1.userJobPreferencesTable)
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
        console.info("[info] completed adding userJobPreferences to userJobPreferencesTable");
        console.info("[info] adding taskSchedules to taskSchedulesTable...");
        for (const jobPreference of userJobPreferences) {
            const searchTask = tasks.find((t) => t.name === "Job Search");
            await db.insert(taskSchedules_1.taskSchedulesTable).values({
                frequency: "0 */5 * * * *",
                taskId: searchTask?.id,
                userId: user.id,
                preferenceId: jobPreference.id,
            });
        }
        console.info("[info] completed adding taskSchedules to taskSchedulesTable");
    }
    const applyTask = tasks.find((t) => t.name === "Job Apply");
    await db.insert(taskSchedules_1.taskSchedulesTable).values({
        frequency: "0 */5 * * * *",
        taskId: applyTask?.id,
        userId: user.id,
    });
    console.info("[info] completed seeding database");
};
main();
