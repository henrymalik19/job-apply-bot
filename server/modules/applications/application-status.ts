/**
 * Every application status, in pipeline order. Mirrors the `app_status` enum;
 * allowed moves between them live in the `status_transitions` table.
 */
export const APP_STATUSES = [
  "queued", "needs_input", "manual", "approved", "submitted", "confirmed",
  "responded", "interviewing", "offer", "rejected", "skipped", "expired", "failed",
] as const;

/** One application status. */
export type AppStatus = (typeof APP_STATUSES)[number];

/** Statuses shown as the overview funnel, from queued to offer. */
export const FUNNEL_STATUSES: readonly AppStatus[] = [
  "queued", "approved", "submitted", "confirmed", "responded", "interviewing", "offer",
];

/** Statuses that are waiting on the owner (the "Needs you" lane). */
export const NEEDS_YOU_STATUSES: readonly AppStatus[] = ["needs_input", "manual"];

/** Cause format for status changes: `<actor>:<action>`, e.g. `user:approve`, `email:confirmation`. */
export const CAUSE_PATTERN = /^(user|email|worker|system):[a-z_]+$/;
