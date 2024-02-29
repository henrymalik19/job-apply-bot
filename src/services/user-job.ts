import { and, eq } from "drizzle-orm";

import { USER_JOB_STATUSES } from "../constants";
import { db } from "../database/db";
import { jobsTable } from "../database/schema/jobs";
import { NewUserJob, userJobsTable } from "../database/schema/userJobs";

class UserJobService {
  // CRUD
  // async findAll() {}

  async findById(id: number) {
    const userJob = (
      await db.select().from(userJobsTable).where(eq(userJobsTable.id, id))
    )[0];

    return userJob;
  }

  async create(createPayload: NewUserJob) {
    const userJob = (
      await db.insert(userJobsTable).values(createPayload).returning()
    )[0];

    return userJob;
  }

  async update(id: number, updatePayload: Partial<NewUserJob>) {
    const userJob = (
      await db
        .update(userJobsTable)
        .set({ ...updatePayload, updatedAt: new Date() })
        .where(eq(userJobsTable.id, id))
        .returning()
    )[0];

    return userJob;
  }

  // async delete(id: number) {}

  async findByJobId(id: number) {
    const userJob = (
      await db
        .select()
        .from(userJobsTable)
        .where(and(eq(userJobsTable.jobId, id)))
    )[0];

    return userJob;
  }

  async findReadyToApply(userId: number, limit: number) {
    const jobsToApply = await db
      .select({ id: userJobsTable.id, platformId: jobsTable.platformId })
      .from(userJobsTable)
      .innerJoin(jobsTable, eq(jobsTable.id, userJobsTable.jobId))
      .where(
        and(
          eq(userJobsTable.userId, userId),
          eq(userJobsTable.status, USER_JOB_STATUSES.READY),
        ),
      )
      .limit(limit);

    return jobsToApply;
  }
}

export { UserJobService };
