import type { Db } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";

/**
 * Records that applications were notified in their current status. Only rows
 * still in that status are touched, so a change made meanwhile is notified next time.
 */
export async function markNotified(db: Db, items: { id: string; status: string }[]): Promise<void> {
  const byStatus = new Map<string, string[]>();
  for (const i of items) byStatus.set(i.status, [...(byStatus.get(i.status) ?? []), i.id]);
  for (const [status, ids] of byStatus) {
    check(await db.from("applications").update({ notified_status: status }).in("id", ids).eq("status", status), "mark notified");
  }
}

/** When the last notification email went out, from `worker_runs` (worker `notify`), or null. */
export async function lastSentAt(db: Db): Promise<Date | null> {
  const rows = unwrap(
    await db
      .from("worker_runs")
      .select("started_at, counts")
      .eq("worker", "notify")
      .eq("ok", true)
      .order("started_at", { ascending: false })
      .limit(50),
    "last notification",
  );
  const sent = rows.find((r) => Number((r.counts as Record<string, number> | null)?.sent ?? 0) > 0);
  return sent ? new Date(sent.started_at) : null;
}
