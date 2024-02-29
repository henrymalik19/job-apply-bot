import { eq } from "drizzle-orm";

import { db } from "../database/db";
import { NewUser, usersTable } from "../database/schema/users";

class UserService {
  // CRUD
  // async findAll() {}

  async findById(id: number) {
    const user = (
      await db.select().from(usersTable).where(eq(usersTable.id, id))
    )[0];

    return user;
  }

  // async create() {}

  // async update(updatePayload: NewUser) {}

  // async delete(id: number) {}
}

export { UserService };
