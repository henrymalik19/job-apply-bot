// Companies that take only so many applications from one person ("a total of 2 jobs over a span of 60
// days"). The rule lives on the company (the same for everyone); when you can apply there again lives on
// your follow of it (user_companies.paused_until). Until then nothing new is prepared there.
import type { Db } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";
import { IllegalTransitionError, transition } from "@/server/modules/applications/applications.repository";
import { deleteApplication } from "@/server/modules/prepare/prepare.repository";

/** Days a company is paused for when its message doesn't say how long the limit lasts. */
export const DEFAULT_LIMIT_DAYS = 60;

/** The cause on an application skipped because a company's limit was reached (it comes back after). */
export const LIMIT_CAUSE = "worker:limit";

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

  return { until, skipped: await skipWaitingAt(db, userId, job.company_id, reason) };
}

/**
 * Your applications at a company not sent yet (and not being filled by the runner right now), skipped
 * because you're at its limit: they wait on nothing they can get. They come back when it's over
 * ({@link reviveAfterLimit}).
 *
 * @returns How many were skipped.
 */
async function skipWaitingAt(db: Db, userId: string, companyId: string, reason: string): Promise<number> {
  const waiting = unwrap(
    await db
      .from("applications")
      .select("id, jobs!inner(company_id)")
      .eq("user_id", userId)
      .eq("jobs.company_id", companyId)
      .in("status", WAITING)
      .is("apply_step", null),
    "read waiting applications there",
  );
  let skipped = 0;
  for (const a of waiting) {
    try {
      await transition(db, a.id, "skipped", LIMIT_CAUSE, { reason });
      skipped++;
    } catch (err) {
      if (!(err instanceof IllegalTransitionError)) throw err;
    }
  }
  return skipped;
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

/** Your pause at one company and its rule, or null when it has neither: for a job's or an application's page. */
export async function getCompanyLimit(db: Db, userId: string, companyId: string | null, now: Date): Promise<CompanyLimit | null> {
  if (!companyId) return null;
  const row = unwrap(
    await db
      .from("companies")
      .select("apply_limit, apply_limit_days, user_companies(user_id, paused_until, pause_reason)")
      .eq("id", companyId)
      .eq("user_companies.user_id", userId)
      .maybeSingle(),
    "read company limit",
  ) as unknown as { apply_limit: number | null; apply_limit_days: number | null; user_companies: { paused_until: string | null; pause_reason: string | null }[] } | null;
  if (!row) return null;
  const follow = row.user_companies[0];
  const paused = !!follow?.paused_until && new Date(follow.paused_until) > now;
  if (!paused && row.apply_limit == null) return null;
  return { limit: row.apply_limit, days: row.apply_limit_days, pausedUntil: paused ? follow.paused_until : null, reason: paused ? follow.pause_reason : null };
}

/**
 * Companies where you can't apply right now, kept on your follow of each (user_companies.paused_until) so
 * Companies shows the date: one paused after a refusal, and one with a known rule where you've already
 * sent as many as it takes within its window (paused until the oldest of those leaves the window, before
 * any refusal).
 */
export async function companiesAtLimit(db: Db, userId: string, now: Date): Promise<Set<string>> {
  const limited = unwrap(
    await db.from("companies").select("id, name, apply_limit, apply_limit_days, user_companies!inner(user_id, paused_until)").eq("user_companies.user_id", userId).not("apply_limit", "is", null),
    "read company limits",
  ) as unknown as { id: string; name: string; apply_limit: number; apply_limit_days: number; user_companies: { paused_until: string | null }[] }[];
  for (const c of limited) {
    const sent = unwrap(
      await db
        .from("applications")
        .select("submitted_at, jobs!inner(company_id)")
        .eq("user_id", userId)
        .eq("jobs.company_id", c.id)
        .in("status", SENT)
        .gte("submitted_at", new Date(now.getTime() - c.apply_limit_days * 86_400_000).toISOString())
        .order("submitted_at", { ascending: true }),
      "read applications sent there",
    );
    if (sent.length < c.apply_limit) continue;
    // A slot frees when enough of them leave the window to go below the limit.
    const until = new Date(new Date(sent[sent.length - c.apply_limit].submitted_at!).getTime() + c.apply_limit_days * 86_400_000);
    const current = c.user_companies[0]?.paused_until;
    if (current && new Date(current) >= until) continue;
    const reason = `${c.name} takes ${c.apply_limit} ${c.apply_limit === 1 ? "application" : "applications"} per ${c.apply_limit_days} days, and you've sent ${sent.length}; you can apply again on ${until.toISOString().slice(0, 10)}.`;
    check(await db.from("user_companies").update({ paused_until: until.toISOString(), pause_reason: reason }).eq("user_id", userId).eq("company_id", c.id), "pause company");
  }
  const paused = unwrap(
    await db.from("user_companies").select("company_id, pause_reason").eq("user_id", userId).gt("paused_until", now.toISOString()),
    "read paused companies",
  );
  // Applications there not sent yet can't go out until then: skipped, to come back after.
  for (const p of paused) await skipWaitingAt(db, userId, p.company_id, p.pause_reason ?? "You've reached this company's limit on applications.");
  return new Set(paused.map((p) => p.company_id));
}

/**
 * Applications skipped because a company's limit was reached, back once you can apply there again: each
 * is removed, so its job is prepared afresh (best match first, as the limit allows) if its posting is
 * still open. One whose posting closed stays skipped.
 *
 * @param atLimit - Companies still at their limit ({@link companiesAtLimit}).
 * @returns How many came back.
 */
export async function reviveAfterLimit(db: Db, userId: string, atLimit: ReadonlySet<string>): Promise<number> {
  const rows = unwrap(
    await db
      .from("applications")
      .select("id, jobs!inner(company_id, closed_at), application_events(cause, created_at)")
      .eq("user_id", userId)
      .eq("status", "skipped")
      .is("jobs.closed_at", null),
    "read skipped applications",
  ) as unknown as { id: string; jobs: { company_id: string | null }; application_events: { cause: string; created_at: string }[] }[];
  let revived = 0;
  for (const a of rows) {
    const last = [...a.application_events].sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
    if (last?.cause !== LIMIT_CAUSE || !a.jobs.company_id || atLimit.has(a.jobs.company_id)) continue;
    // An email linked to it keeps it (that link has no cascade).
    if (await deleteApplication(db, a.id).then(() => true, () => false)) revived++;
  }
  return revived;
}

/**
 * Clears a company's limit, when it no longer has one or the date is wrong: your pause there, and the rule
 * saved for the company (it's learned again if it refuses once more).
 */
export async function clearLimit(db: Db, userId: string, companyId: string): Promise<void> {
  check(await db.from("user_companies").update({ paused_until: null, pause_reason: null }).eq("user_id", userId).eq("company_id", companyId), "clear pause");
  check(await db.from("companies").update({ apply_limit: null, apply_limit_days: null }).eq("id", companyId), "clear apply limit");
}
