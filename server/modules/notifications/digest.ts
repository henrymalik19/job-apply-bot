// Pure parts of the notify worker: which applications are worth an email,
// quiet hours, and the digest email itself.

/** Statuses that are worth an email. */
export const NOTIFY_STATUSES = ["needs_input", "manual", "queued", "interviewing", "offer"] as const;
/** A status that is worth an email. */
export type NotifyStatus = (typeof NOTIFY_STATUSES)[number];

/** Header on every notification, so the inbox reader (M6) skips our own mail. */
export const NOTIFY_HEADER = "X-Autopilot";

/** One application in a digest. */
export type NotifyItem = {
  id: string;
  status: NotifyStatus;
  title: string;
  company: string;
  score: number | null;
  /** Required questions only you can answer (needs_input). */
  questions: string[];
  /** Short descriptions of the application's flags. */
  flags: string[];
  /** Why the form couldn't be filled (manual). */
  prepareError: string | null;
};

/**
 * True when an application should be in the next digest: its status is worth
 * an email and it hasn't been notified in that status. "Ready to review" is
 * only sent for a fresh application, not one that got there because you
 * answered its questions.
 *
 * @param notifiedStatus - `applications.notified_status`.
 */
export function isDue(status: string, notifiedStatus: string | null): status is NotifyStatus {
  if (!(NOTIFY_STATUSES as readonly string[]).includes(status) || status === notifiedStatus) return false;
  return status !== "queued" || notifiedStatus === null;
}

/** Quiet hours as local "HH:MM" times in an IANA time zone; start > end wraps past midnight. */
export type QuietHours = { start: string; end: string; timezone: string };

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** True when `now` falls inside quiet hours (start inclusive, end exclusive). */
export function inQuietHours(now: Date, quiet: QuietHours): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: quiet.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const local = get("hour") * 60 + get("minute");
  const start = minutes(quiet.start);
  const end = minutes(quiet.end);
  if (start === end) return false;
  return start < end ? local >= start && local < end : local >= start || local < end;
}

const SECTIONS: { status: NotifyStatus; heading: string; page: string; count: (n: number) => string }[] = [
  { status: "offer", heading: "Offers", page: "/app", count: (n) => `${n} offer${n === 1 ? "" : "s"}` },
  { status: "interviewing", heading: "Interviews", page: "/app", count: (n) => `${n} interview${n === 1 ? "" : "s"}` },
  { status: "needs_input", heading: "Questions only you can answer", page: "/app/needs-you", count: (n) => `${n} need${n === 1 ? "s" : ""} you` },
  { status: "manual", heading: "Apply yourself", page: "/app/needs-you", count: (n) => `${n} to apply yourself` },
  { status: "queued", heading: "Ready to review", page: "/app/review", count: (n) => `${n} ready to review` },
];

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Detail lines under an application: blocking questions, flags, why it's manual. */
function details(item: NotifyItem): string[] {
  return [
    ...item.questions.map((q) => `Question: ${q}`),
    ...item.flags.map((f) => `Flag: ${f}`),
    ...(item.prepareError ? [item.prepareError] : []),
  ];
}

/**
 * The digest email for some applications: a subject with counts, and plain
 * text and HTML bodies grouped by status, each application linked.
 *
 * @param appUrl - The web app's origin, e.g. `https://job-apply-bot-nu.vercel.app`.
 */
export function buildDigest(items: NotifyItem[], appUrl: string): { subject: string; text: string; html: string } {
  const base = appUrl.replace(/\/$/, "");
  const groups = SECTIONS.map((s) => ({ ...s, items: items.filter((i) => i.status === s.status) })).filter((g) => g.items.length > 0);
  const subject = `[Autopilot] ${groups.map((g) => g.count(g.items.length)).join(", ")}`;

  const text = groups
    .map((g) => [
      `${g.heading} (${base}${g.page})`,
      ...g.items.flatMap((i) => [
        `- ${i.title} at ${i.company}${i.score != null ? ` (score ${i.score})` : ""}: ${base}/app/applications/${i.id}`,
        ...details(i).map((d) => `    ${d}`),
      ]),
    ].join("\n"))
    .join("\n\n");

  const html = groups
    .map((g) => {
      const rows = g.items
        .map((i) => {
          const sub = details(i).map((d) => `<li style="color:#555">${escapeHtml(d)}</li>`).join("");
          return `<li><a href="${base}/app/applications/${i.id}">${escapeHtml(i.title)}</a> at ${escapeHtml(i.company)}${i.score != null ? ` (score ${i.score})` : ""}${sub ? `<ul>${sub}</ul>` : ""}</li>`;
        })
        .join("");
      return `<h3 style="margin:16px 0 4px"><a href="${base}${g.page}">${escapeHtml(g.heading)}</a></h3><ul>${rows}</ul>`;
    })
    .join("");

  return { subject, text: `${text}\n`, html: `<div style="font-family:sans-serif;font-size:14px">${html}</div>` };
}
