import { eq } from "drizzle-orm";

import { TASK_EXECUTION_STATUSES } from "../constants";
import { db } from "../database/db";
import {
  NewTaskExecution,
  taskExecutionsTable,
} from "../database/schema/taskExecutions";

class TaskExecutionService {
  // CRUD
  // async findAll() {}

  // async findById(id: number) {}

  async create(createPayload: NewTaskExecution) {
    console.info(`[info] creating an entry in the taskExecutions table...`);

    const taskExecution = (
      await db
        .insert(taskExecutionsTable)
        .values({
          status: TASK_EXECUTION_STATUSES.PENDING,
          // scheduleId: taskToSchedule.id,
          // startedAt: new Date(),
        })
        .returning()
    )[0];

    return taskExecution;
  }

  async update(id: number, updatePayload: NewTaskExecution) {
    const taskExecution = (
      await db
        .update(taskExecutionsTable)
        .set({ ...updatePayload })
        .where(eq(taskExecutionsTable.id, id))
        .returning()
    )[0];

    return taskExecution;
  }

  // async delete(id: number) {}
}

export { TaskExecutionService };
