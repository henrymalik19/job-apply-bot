import type { SupabaseClient } from "@supabase/supabase-js";

export const APP_STATUSES = [
  "queued", "needs_input", "manual", "approved", "submitted", "confirmed",
  "responded", "interviewing", "offer", "rejected", "skipped", "expired", "failed",
] as const;

export type AppStatus = (typeof APP_STATUSES)[number];

// Cause format: "<actor>:<action>", e.g. "user:approve", "email:confirmation", "worker:expire".
const CAUSE_RE = /^(user|email|worker|system):[a-z_]+$/;

export class IllegalTransitionError extends Error {}

// The only way application status changes. Allowed moves live in the
// status_transitions table; the database rejects anything else, and rejects
// raw UPDATEs of applications.status that bypass transition_application().
export async function transition(
  db: SupabaseClient,
  applicationId: string,
  to: AppStatus,
  cause: string,
  detail?: Record<string, unknown>,
) {
  if (!CAUSE_RE.test(cause)) throw new Error(`invalid cause "${cause}"`);
  const { data, error } = await db.rpc("transition_application", {
    p_application_id: applicationId,
    p_to: to,
    p_cause: cause,
    p_detail: detail ?? null,
  });
  if (error) {
    if (error.message.startsWith("illegal transition")) throw new IllegalTransitionError(error.message);
    throw new Error(`transition failed: ${error.message}`);
  }
  return data;
}
