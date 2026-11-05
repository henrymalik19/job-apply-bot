// Companies that take only so many applications from one person ("a total of 2 jobs over a span of 60
// days"). The rule lives on the company (the same for everyone); when you can apply there again lives on
// your follow of it (user_companies.paused_until). Until then nothing new is prepared there.
import type { Db } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";
import { IllegalTransitionError, transition } from "@/server/modules/applications/applications.repository";

/** Days a company is paused for when its message doesn't say how long the limit lasts. */
export const DEFAULT_LIMIT_DAYS = 60;

/** Statuses of an application that was sent (it counts toward a company's limit). */
const SENT = ["submitted", "confirmed", "responded", "interviewing", "offer", "rejected", "no_reply"];
/** Statuses of an application not sent yet, which a reached limit skips. */
const WAITING = ["queued", "needs_input", "manual", "approved"];

const NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const num = (s: string) => NUMBERS[s.toLowerCase()] ?? Number(s);

/**
 * A company's limit as its message states it: "a total of 2 jobs over a span of 60 days", "up to three
 * applications every 6 months". Null when it doesn't say both how many and over how long.
 */
export function parseApplyLimit(text: string): { count: number; days: number } | null {
  const m = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:jobs?|roles?|positions?|applications?|openings?)\b[^.]{0,40}?\b(?:over|in|within|per|every|during)\s+(?:a\s+(?:span|period)\s+of\s+|the\s+(?:last|past)\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a)?\s*(days?|weeks?|months?|years?)\b/i.exec(text);
  if (!m) return null;
  const count = num(m[1]);
  const amount = !m[2] || m[2].toLowerCase() === "a" ? 1 : num(m[2]);
  const unit = m[3].toLowerCase().replace(/s$/, "");
  const days = amount * (unit === "day" ? 1 : unit === "week" ? 7 : unit === "month" ? 30 : 365);
  return count > 0 && days > 0 && Number.isFinite(count) && Number.isFinite(days) ? { count, days } : null;
}

/**
 * A company refused an application because you reached its limit: the rule is saved on the company (when
 * the message states it), you're paused there until a slot frees up (the oldest application you sent in
 * the window, plus the window; from now when none were sent through Jobrx), and your other applications
 * there not sent yet are skipped with the same reason.
 *
 * @returns When you can apply there again, and how many waiting applications were skipped.
 */
export async function recordLimitReached(
  db: Db,
  userId: string,
  jobId: string,
  said: string,
  now: Date,
): Promise<{ until: Date; skipped: number } | null> {
  const job = unwrap(await db.from("jobs").select("company_id, company_name").eq("id", jobId).single(), "read job");
  if (!job.company_id) return null;
  const rule = parseApplyLimit(said);
  if (rule) check(await db.from("companies").update({ apply_limit: rule.count, apply_limit_days: rule.days }).eq("id", job.company_id), "save apply limit");
  const days = rule?.days ?? DEFAULT_LIMIT_DAYS;

  const sent = unwrap(
    await db
      .from("applications")
      .select("submitted_at, jobs!inner(company_id)")
      .eq("user_id", userId)
      .eq("jobs.company_id", job.company_id)
      .in("status", SENT)
      .gte("submitted_at", new Date(now.getTime() - days * 86_400_000).toISOString())
      .order("submitted_at", { ascending: true })
      .limit(1),
    "read applications sent there",
  );
  const from = sent[0]?.submitted_at ? new Date(sent[0].submitted_at) : now;
  const until = new Date(from.getTime() + days * 86_400_000);
  const reason = rule
    ? `${job.company_name} takes ${rule.count} ${rule.count === 1 ? "application" : "applications"} per ${rule.days} days; you can apply again on ${until.toISOString().slice(0, 10)}.`
    : `${job.company_name} said you reached its application limit; trying again on ${until.toISOString().slice(0, 10)}.`;
  check(
    await db.from("user_companies").upsert({ user_id: userId, company_id: job.company_id, paused_until: until.toISOString(), pause_reason: reason }, { onConflict: "user_id,company_id" }),
    "pause company",
  );

  // The rest there waits on nothing it can get: skipped, with the reason.
  const waiting = unwrap(
    await db
      .from("applications")
      .select("id, jobs!inner(company_id)")
      .eq("user_id", userId)
      .eq("jobs.company_id", job.company_id)
      .in("status", WAITING)
      .is("apply_step", null),
    "read waiting applications there",
  );
  let skipped = 0;
  for (const a of waiting) {
    try {
      await transition(db, a.id, "skipped", "worker:limit", { reason });
      skipped++;
    } catch (err) {
      if (!(err instanceof IllegalTransitionError)) throw err;
    }
  }
  return { until, skipped };
}

/** A company's limit on applications and, when you reached it, until when: for showing on its row. */
export type CompanyLimit = { limit: number | null; days: number | null; pausedUntil: string | null; reason: string | null };

/** The limits and pauses of the companies you follow that have either, by company id. */
export async function listCompanyLimits(db: Db, userId: string, now: Date): Promise<Map<string, CompanyLimit>> {
  const rows = unwrap(
    await db.from("user_companies").select("company_id, paused_until, pause_reason, companies!inner(apply_limit, apply_limit_days)").eq("user_id", userId),
    "read company limits",
  ) as unknown as { company_id: string; paused_until: string | null; pause_reason: string | null; companies: { apply_limit: number | null; apply_limit_days: number | null } }[];
  const out = new Map<string, CompanyLimit>();
  for (const r of rows) {
    const paused = r.paused_until && new Date(r.paused_until) > now;
    if (!paused && r.companies.apply_limit == null) continue;
    out.set(r.company_id, {
      limit: r.companies.apply_limit, days: r.companies.apply_limit_days,
      pausedUntil: paused ? r.paused_until : null, reason: paused ? r.pause_reason : null,
    });
  }
  return out;
}

/**
 * Companies where you can't apply right now: paused after a refusal, or where you've already sent as many
 * as the company's known limit takes within its window.
 */
export async function companiesAtLimit(db: Db, userId: string, now: Date): Promise<Set<string>> {
  const at = new Set<string>();
  const paused = unwrap(
    await db.from("user_companies").select("company_id").eq("user_id", userId).gt("paused_until", now.toISOString()),
    "read paused companies",
  );
  for (const p of paused) at.add(p.company_id);
  const limited = unwrap(
    await db.from("companies").select("id, apply_limit, apply_limit_days").not("apply_limit", "is", null),
    "read company limits",
  );
  for (const c of limited) {
    if (at.has(c.id)) continue;
    const { count } = await db
      .from("applications")
      .select("id, jobs!inner(company_id)", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("jobs.company_id", c.id)
      .in("status", [...SENT, "approved"])
      .gte("submitted_at", new Date(now.getTime() - c.apply_limit_days! * 86_400_000).toISOString());
    if ((count ?? 0) >= c.apply_limit!) at.add(c.id);
  }
  return at;
}
