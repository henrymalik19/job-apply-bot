import type { Db, Json, Row } from "@/server/db/types";
import { APP_STATUSES, CAUSE_PATTERN, type AppStatus } from "@/server/modules/applications/application-status";
import { unwrap } from "@/server/core/errors";

/** A row of `applications`. */
export type Application = Row<"applications">;

/** The database refused a status change that `status_transitions` does not allow. */
export class IllegalTransitionError extends Error {}

/**
 * Changes an application's status: the only way status ever changes. Allowed
 * moves live in `status_transitions`; the database rejects anything else (and
 * rejects raw UPDATEs of `applications.status`) and writes an `events` row.
 *
 * @param cause - `<actor>:<action>`, e.g. `user:approve` (see `CAUSE_PATTERN`).
 * @param detail - Optional JSON stored on the event.
 * @throws {@link IllegalTransitionError} when the move is not allowed.
 */
export async function transition(
  db: Db,
  applicationId: string,
  to: AppStatus,
  cause: string,
  detail?: Record<string, unknown>,
): Promise<Application> {
  if (!CAUSE_PATTERN.test(cause)) throw new Error(`invalid cause "${cause}"`);
  const { data, error } = await db.rpc("transition_application", {
    p_application_id: applicationId,
    p_to: to,
    p_cause: cause,
    p_detail: (detail ?? null) as Json,
  });
  if (error) {
    if (error.message.startsWith("illegal transition")) throw new IllegalTransitionError(error.message);
    throw new Error(`transition failed: ${error.message}`);
  }
  return data as Application;
}

/** Number of applications in each status (every status present, zero if none). */
export async function countByStatus(db: Db): Promise<Record<AppStatus, number>> {
  const rows = unwrap(await db.from("applications").select("status"), "count applications");
  const counts = Object.fromEntries(APP_STATUSES.map((s) => [s, 0])) as Record<AppStatus, number>;
  for (const row of rows) counts[row.status as AppStatus]++;
  return counts;
}
