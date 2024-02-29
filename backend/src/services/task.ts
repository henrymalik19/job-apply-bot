import { eq } from "drizzle-orm";

import { db } from "../database/db";
import { NewTask, tasksTable } from "../database/schema/tasks";

class TaskService {
  // CRUD
  // async findAll() {}

  async findById(id: number) {
    const task = (
      await db.select().from(tasksTable).where(eq(tasksTable.id, id))
    )[0];

    return task;
  }

  // async create() {}

  // async update(updatePayload: NewTask) {}

  // async delete(id: number) {}
}

export { TaskService };
