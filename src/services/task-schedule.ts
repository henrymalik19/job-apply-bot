import { and, eq, lte, notInArray } from "drizzle-orm";

import { TASK_EXECUTION_STATUSES } from "../constants";
import { db } from "../database/db";
import { taskExecutionsTable } from "../database/schema/taskExecutions";
import {
  NewTaskSchedule,
  taskSchedulesTable,
} from "../database/schema/taskSchedules";

class TaskScheduleService {
  // CRUD
  //   async findAll() {}

  //   async findById(id: number) {}

  //   async create() {}

  //   async update(updatePayload: NewTaskSchedule) {}

  //   async delete(id: number) {}

  async findAllReadyToSchedule() {
    const now = new Date();

    const inProgressTaskExecutions = db
      .select({ scheduleId: taskExecutionsTable.scheduleId })
      .from(taskExecutionsTable)
      .where(
        eq(taskExecutionsTable.status, TASK_EXECUTION_STATUSES.IN_PROGRESS),
      );

    const tasksToSchedule = await db
      .select()
      .from(taskSchedulesTable)
      .where(
        and(
          lte(taskSchedulesTable.nextRunAt, now),
          eq(taskSchedulesTable.enabled, true),
          notInArray(taskSchedulesTable.id, inProgressTaskExecutions),
        ),
      );

    return tasksToSchedule;
  }
}

export { TaskScheduleService };
