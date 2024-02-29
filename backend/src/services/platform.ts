import { eq } from "drizzle-orm";

import { db } from "../database/db";
import { NewPlatform, platformsTable } from "../database/schema/platforms";

class PlatformService {
  // CRUD
  // async findAll() {}

  async findById(id: number) {
    const platform = (
      await db.select().from(platformsTable).where(eq(platformsTable.id, id))
    )[0];

    return platform;
  }

  //   async create(createPayload: NewPlatform) {}

  //   async update(id: number, updatePayload: NewPlatform) {}

  //   async delete(id: number) {}
}

export { PlatformService };
