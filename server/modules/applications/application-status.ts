/**
 * Every application status, in pipeline order. Mirrors the `applications.status` check constraint;
 * allowed moves between them live in the `status_transitions` table.
 */
export const APP_STATUSES = [
  "queued", "needs_input", "manual", "approved", "submitted", "confirmed",
  "responded", "interviewing", "offer", "rejected", "skipped", "expired", "failed", "no_reply",
] as const;

/** One application status. */
export type AppStatus = (typeof APP_STATUSES)[number];

/** Statuses shown as the overview funnel, from queued to offer. */
export const FUNNEL_STATUSES: readonly AppStatus[] = [
  "queued", "approved", "submitted", "confirmed", "responded", "interviewing", "offer",
];

/** Statuses that are waiting on the owner (the "Needs you" lane). */
export const NEEDS_YOU_STATUSES: readonly AppStatus[] = ["needs_input", "manual"];

/**
 * Whether a manual application is one the apply runner handed back (it always leaves its
 * reason in apply_note), rather than one preparing found can't be filled automatically.
 */
export const runnerHandedBack = (app: { status: string; apply_note: string | null }) => app.status === "manual" && app.apply_note != null;

/** Cause format for status changes: `<actor>:<action>`, e.g. `user:approve`, `email:confirmation`. */
export const CAUSE_PATTERN = /^(user|email|worker|system):[a-z_]+$/;

/** Statuses after approval, shown on the Applying board (confirmed shares the Submitted column; manual is Runner stuck). */
export const BOARD_STATUSES: readonly AppStatus[] = [
  "approved", "manual", "submitted", "confirmed", "responded", "interviewing", "offer", "no_reply", "rejected", "expired", "failed",
];

/**
 * Statuses you can move an application to by hand: you applied, they replied, an interview, an
 * offer, a no, no reply, or the posting is gone (expired, before submitting).
 */
export const USER_MOVE_TARGETS: readonly AppStatus[] = ["submitted", "responded", "interviewing", "offer", "rejected", "no_reply", "expired"];

/** Days a submitted application can go without a reply before it moves to No reply (user_settings.no_reply_days). */
export const NO_REPLY_DAYS = 30;
/** The same once its posting has closed (the role is likely filled). */
export const NO_REPLY_DAYS_CLOSED = 14;
