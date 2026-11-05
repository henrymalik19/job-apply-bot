// In-app notifications: what happened that you'd want to know, each with where to go. Email tracking, the
// apply runner and prepare add them; the bell in the app shows the unread ones. A `dedupeKey` keeps one per
// event when a worker runs again over the same thing.
import type { Db } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";

/** What a notification is about, which sets its icon and color. */
export const NOTIFICATION_KINDS = [
  "interview", // an interview invite arrived
  "reply", // a recruiter or the employer replied
  "rejection", // a rejection arrived
  "email_to_sort", // an email about an application tracking couldn't tie to one
  "runner_waiting", // the runner filled a form and waits for you in Chrome
  "runner_stuck", // the runner handed an application back
  "submitted", // the runner submitted an application
  "prepared", // new applications to review or answer
] as const;

/** One kind of notification. */
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** A notification to add. */
export type NewNotification = {
  kind: NotificationKind;
  title: string;
  body?: string | null;
  /** Where it leads in the app, e.g. /app/applications/<id>. */
  href?: string | null;
  applicationId?: string | null;
  /** The same key twice for one user is one notification (a worker running again over the same event). */
  dedupeKey?: string | null;
};

/** A notification as the app shows it. */
export type Notification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

/** Where an application's notifications lead. */
export const applicationHref = (applicationId: string) => `/app/applications/${applicationId}`;

/**
 * Adds a notification for a user; one with a `dedupeKey` they already have is skipped. Never throws:
 * a notification that can't be saved shouldn't stop the work it's about.
 */
export async function notify(db: Db, userId: string, n: NewNotification): Promise<void> {
  try {
    const row = {
      user_id: userId,
      kind: n.kind,
      title: n.title.slice(0, 300),
      body: n.body?.slice(0, 1000) ?? null,
      href: n.href ?? null,
      application_id: n.applicationId ?? null,
      dedupe_key: n.dedupeKey ?? null,
    };
    const res = n.dedupeKey
      ? await db.from("notifications").upsert(row, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
      : await db.from("notifications").insert(row);
    if (res.error) console.error(`notification not saved: ${res.error.message}`);
  } catch (err) {
    console.error(`notification not saved: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** A user's notifications, newest first. */
export async function listNotifications(db: Db, userId: string, limit = 50): Promise<Notification[]> {
  const rows = unwrap(
    await db.from("notifications").select("id, kind, title, body, href, read_at, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit),
    "list notifications",
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind as NotificationKind, title: r.title, body: r.body, href: r.href, readAt: r.read_at, createdAt: r.created_at }));
}

/** How many of a user's notifications are unread. */
export async function countUnread(db: Db, userId: string): Promise<number> {
  const { count, error } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
  if (error) throw new Error(`count unread notifications: ${error.message}`);
  return count ?? 0;
}

/** Marks some of a user's notifications read (all of them without `ids`). */
export async function markRead(db: Db, userId: string, ids?: string[]): Promise<void> {
  let query = db.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
  if (ids) query = query.in("id", ids);
  check(await query, "mark notifications read");
}

/** Removes notifications older than `days` (90 by default) for every user (service role). */
export async function pruneNotifications(db: Db, now: Date, days = 90): Promise<void> {
  check(await db.from("notifications").delete().lt("created_at", new Date(now.getTime() - days * 86_400_000).toISOString()), "prune notifications");
}
