// The apply runner's record of each attempt (step log, screenshots, the form's HTML), uploaded when the
// run ends so the application's page can show why a field wasn't filled. The runner keeps its local copy
// in data/apply-debug too, so a failed upload loses nothing.
import { randomUUID } from "node:crypto";
import type { Db } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";

/** The private Storage bucket for run records, one folder per user. */
export const APPLY_RUNS_BUCKET = "apply-runs";

/** One file of a run record. */
export type RunFile = { name: string; bytes: Uint8Array };

/** One run as the application's page shows it. */
export type ApplyRunView = {
  id: string;
  /** Whose run it was. */
  user: { id: string; name: string };
  /** The application and its job (as they were when the run was saved). */
  application: { id: string; title: string; company: string };
  startedAt: string;
  outcome: string;
  /** The step log, or null if it wasn't uploaded. */
  log: string | null;
  /** Screenshots in the order taken, with links that work for an hour. */
  shots: { name: string; url: string }[];
  /** The form's HTML when the run ended, as a link. */
  formUrl: string | null;
};

const contentType = (name: string) => (name.endsWith(".png") ? "image/png" : name.endsWith(".html") ? "text/html" : "text/plain");

// A token with letters and digits on a line about a code: an emailed security code, blanked before upload.
const CODE_LINE = /code/i;
const CODE_TOKEN = /\b(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{6,10}\b/g;

/** A run log with any emailed security code blanked (the runner doesn't log them, but a page might show one). */
export function redactCodes(log: string): string {
  return log
    .split("\n")
    .map((line) => (CODE_LINE.test(line) ? line.replace(CODE_TOKEN, "[code]") : line))
    .join("\n");
}

/**
 * Uploads one run's files and records it. A file that fails to upload is left out of the record
 * rather than failing the run.
 *
 * @returns The run's id.
 */
export async function saveApplyRun(
  db: Db,
  run: {
    userId: string;
    userName: string;
    applicationId: string;
    jobTitle: string;
    companyName: string;
    startedAt: Date;
    outcome: string;
    files: RunFile[];
  },
): Promise<string> {
  const id = randomUUID();
  const folder = `${run.userId}/${run.applicationId}/${id}`;
  const saved: string[] = [];
  for (const file of run.files) {
    const bytes = file.name === "run.log" ? new TextEncoder().encode(redactCodes(new TextDecoder().decode(file.bytes))) : file.bytes;
    const up = await db.storage.from(APPLY_RUNS_BUCKET).upload(`${folder}/${file.name}`, bytes, { contentType: contentType(file.name) });
    if (!up.error) saved.push(file.name);
  }
  check(
    await db.from("apply_runs").insert({
      id,
      user_id: run.userId,
      user_name: run.userName,
      application_id: run.applicationId,
      job_title: run.jobTitle,
      company_name: run.companyName,
      started_at: run.startedAt.toISOString(),
      outcome: run.outcome.slice(0, 1000),
      folder,
      files: saved,
    }),
    "save apply run",
  );
  return id;
}

/** How many runs an application has recorded. */
export async function countApplyRuns(db: Db, applicationId: string): Promise<number> {
  const res = await db.from("apply_runs").select("id", { count: "exact", head: true }).eq("application_id", applicationId);
  if (res.error) unwrap(res, "count apply runs");
  return res.count ?? 0;
}

/** A person and a job to filter Admin > Runs by, with how many runs each has. */
export type RunFilters = {
  people: { id: string; name: string; runs: number }[];
  jobs: { applicationId: string; userId: string; title: string; company: string; runs: number }[];
};

/** Everyone and every job with runs (the latest 500 runs), most runs first. */
export async function listRunFilters(db: Db): Promise<RunFilters> {
  const rows = unwrap(
    await db.from("apply_runs").select("user_id, user_name, application_id, job_title, company_name").order("started_at", { ascending: false }).limit(500),
    "list run filters",
  );
  const people = new Map<string, RunFilters["people"][number]>();
  const jobs = new Map<string, RunFilters["jobs"][number]>();
  for (const r of rows) {
    const person = people.get(r.user_id) ?? { id: r.user_id, name: r.user_name || "Someone", runs: 0 };
    person.runs++;
    people.set(r.user_id, person);
    const job = jobs.get(r.application_id) ?? { applicationId: r.application_id, userId: r.user_id, title: r.job_title, company: r.company_name, runs: 0 };
    job.runs++;
    jobs.set(r.application_id, job);
  }
  return { people: [...people.values()], jobs: [...jobs.values()] };
}

/**
 * The latest runs, newest first: everyone's, one person's (`userId`) or one application's,
 * with the log text and links to the screenshots. The owner sees everyone's; anyone else, their own.
 */
export async function listApplyRuns(db: Db, opts: { userId?: string; applicationId?: string; limit?: number } = {}): Promise<ApplyRunView[]> {
  let query = db
    .from("apply_runs")
    .select("id, user_id, user_name, application_id, job_title, company_name, started_at, outcome, folder, files")
    .order("started_at", { ascending: false })
    .limit(opts.limit ?? 20);
  if (opts.userId) query = query.eq("user_id", opts.userId);
  if (opts.applicationId) query = query.eq("application_id", opts.applicationId);
  const rows = unwrap(await query, "list apply runs");
  const bucket = db.storage.from(APPLY_RUNS_BUCKET);
  return Promise.all(
    rows.map(async (r) => {
      const at = (name: string) => `${r.folder}/${name}`;
      const pngs = r.files.filter((f) => f.endsWith(".png"));
      const [log, signed, form] = await Promise.all([
        r.files.includes("run.log") ? bucket.download(at("run.log")).then((res) => (res.data ? res.data.text() : null)) : null,
        pngs.length ? bucket.createSignedUrls(pngs.map(at), 3600).then((res) => res.data ?? []) : [],
        r.files.includes("form.html") ? bucket.createSignedUrl(at("form.html"), 3600).then((res) => res.data?.signedUrl ?? null) : null,
      ]);
      const shots = pngs.flatMap((name, i) => (signed[i]?.signedUrl ? [{ name, url: signed[i].signedUrl }] : []));
      return {
        id: r.id,
        user: { id: r.user_id, name: r.user_name || "Someone" },
        application: { id: r.application_id, title: r.job_title, company: r.company_name },
        startedAt: r.started_at,
        outcome: r.outcome,
        log,
        shots,
        formUrl: form,
      };
    }),
  );
}
