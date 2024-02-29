import { eq } from "drizzle-orm";

import { db } from "../database/db";
import {
  NewUserJobPreference,
  userJobPreferencesTable,
} from "../database/schema/userJobPreferences";

class UserJobPreferenceService {
  // CRUD
  // async findAll() {}

  async findById(id: number) {
    const userJobPreference = (
      await db
        .select()
        .from(userJobPreferencesTable)
        .where(eq(userJobPreferencesTable.id, id))
    )[0];

    return userJobPreference;
  }

  // async create() {}

  // async update(updatePayload: NewUserJobPreference) {}

  // async delete(id: number) {}
}

export { UserJobPreferenceService };
