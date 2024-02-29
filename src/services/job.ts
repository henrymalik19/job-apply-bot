import { eq } from "drizzle-orm";

import { db } from "../database/db";
import { NewJob, jobsTable } from "../database/schema/jobs";

class JobService {
  // CRUD
  // async findAll() {}

  async findById(id: number) {
    const job = (
      await db.select().from(jobsTable).where(eq(jobsTable.id, id))
    )[0];

    return job;
  }

  async create(createPayload: NewJob) {
    const newJob = (
      await db
        .insert(jobsTable)
        .values({ ...createPayload })
        .returning()
    )[0];

    return newJob;
  }

  // async update(updatePayload: NewJob) {}

  // async delete(id: number) {}

  async findByPlatformJobId(id: string) {
    const job = (
      await db.select().from(jobsTable).where(eq(jobsTable.platformJobId, id))
    )[0];

    return job;
  }
}

export { JobService };
