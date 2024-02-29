import { credentialsTable } from "database/schema/credentials";
import { and, eq } from "drizzle-orm";

import { db } from "../database/db";
import { NewPlatform, platformsTable } from "../database/schema/platforms";

class CredentialService {
  // CRUD
  //   async findAll() {}

  async findById(id: number) {
    const platform = (
      await db.select().from(platformsTable).where(eq(platformsTable.id, id))
    )[0];

    return platform;
  }

  //   async create(createPayload: NewPlatform) {}

  //   async update(id: number, updatePayload: NewPlatform) {}

  //   async delete(id: number) {}

  async findByUserIdAndPlatformId(userId: number, platformId: number) {
    const credential = (
      await db
        .select()
        .from(credentialsTable)
        .where(
          and(
            eq(credentialsTable.userId, userId),
            eq(credentialsTable.platformId, platformId),
          ),
        )
    )[0];

    return credential;
  }
}

export { CredentialService };
