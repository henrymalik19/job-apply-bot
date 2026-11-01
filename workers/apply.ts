// Apply runner: runs on your own computer, never on Railway. Signs in as you,
// so it sees only your applications, and fills approved ones in a visible
// Chrome window. On a supervised platform you click Submit; it records the
// evidence and marks the application submitted.
//   pnpm worker:apply          (reads .env.local, then .env.apply if present)
// Needs SUPABASE_URL and SUPABASE_ANON_KEY. The first run asks for your email
// and password; only the refreshable session is kept, in data/apply-session.json.
// Chrome uses its own profile in data/apply-chrome, so sign-ins you make there stay.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright-core";
import type { Database } from "@/server/db/database.types";
import type { Db } from "@/server/db/types";
import { greenhouseDriver } from "@/server/integrations/browser/greenhouse-driver";
import { clearStaleSteps, listReadyToApply } from "@/server/modules/apply/apply.repository";
import { APPLY_ATS, applyOne } from "@/server/modules/apply/apply.service";
import { parseApplyEnv } from "@/shared/env";

const DATA = path.resolve("data");
const SESSION_FILE = path.join(DATA, "apply-session.json");
const POLL_MS = 20_000;

const log = (line: string) => console.log(`[${new Date().toLocaleTimeString()}] ${line}`);

/** Supabase auth storage backed by one JSON file, so the session survives restarts. */
function fileStorage() {
  const read = async (): Promise<Record<string, string>> => JSON.parse(await readFile(SESSION_FILE, "utf8").catch(() => "{}"));
  return {
    getItem: async (key: string) => (await read())[key] ?? null,
    setItem: async (key: string, value: string) => {
      await mkdir(DATA, { recursive: true });
      await writeFile(SESSION_FILE, JSON.stringify({ ...(await read()), [key]: value }), { mode: 0o600 });
    },
    removeItem: async (key: string) => {
      const all = await read();
      delete all[key];
      await writeFile(SESSION_FILE, JSON.stringify(all), { mode: 0o600 });
    },
  };
}

/** Asks for email and password in the terminal; the password isn't echoed. */
async function askLogin(): Promise<{ email: string; password: string }> {
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, done) {
      if (!muted) process.stdout.write(chunk);
      done();
    },
  });
  // One interface for both answers, so piped input isn't consumed by the first.
  const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY });
  const email = await rl.question("Email: ");
  const pending = rl.question("Password: ");
  muted = true;
  const password = await pending;
  rl.close();
  process.stdout.write("\n");
  return { email: email.trim(), password };
}

/** Signs in with the saved session, or asks for email and password once. */
async function signIn(db: Db): Promise<string> {
  const { data } = await db.auth.getUser();
  if (data.user) return data.user.id;
  console.log("Sign in to Job Search Autopilot (asked once; only the session is saved).");
  const { email, password } = await askLogin();
  const res = await db.auth.signInWithPassword({ email, password });
  if (res.error || !res.data.user) throw new Error(`sign in failed: ${res.error?.message ?? "no user"}`);
  return res.data.user.id;
}

async function fullName(db: Db, userId: string): Promise<string> {
  const { data } = await db.from("profiles").select("first_name, last_name").eq("user_id", userId).maybeSingle();
  return [data?.first_name, data?.last_name].filter(Boolean).join(" ") || "Resume";
}

async function main() {
  const env = parseApplyEnv(process.env);
  const db: Db = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { storage: fileStorage(), persistSession: true, autoRefreshToken: true, storageKey: "apply-runner" },
  });
  const userId = await signIn(db);
  const name = await fullName(db, userId);
  const stale = await clearStaleSteps(db, userId);
  if (stale) log(`cleared ${stale} application(s) left mid-way by an earlier run`);

  const browser = await chromium.launchPersistentContext(path.join(DATA, "apply-chrome"), {
    channel: "chrome",
    headless: false,
    viewport: null,
  });
  const files = path.join(tmpdir(), "job-search-autopilot-apply");
  await mkdir(files, { recursive: true });
  const saveResume = async (pdf: Uint8Array, fileName: string) => {
    const file = path.join(files, fileName.replace(/[^\w .-]/g, ""));
    await writeFile(file, pdf);
    return file;
  };

  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on("SIGINT", stop);
  browser.on("close", stop);
  log(`apply runner started for ${name}; watching for approved ${APPLY_ATS.join(", ")} applications (Ctrl+C to stop)`);

  let done: Page[] = [];
  while (!stopping) {
    try {
      const ready = await listReadyToApply(db, userId, APPLY_ATS);
      for (const app of ready) {
        if (stopping) break;
        // Submitted tabs are finished with; handed-back ones stay open for you.
        for (const p of done) await p.close().catch(() => undefined);
        done = [];
        const page = await browser.newPage();
        try {
          const outcome = await applyOne({ db, userId, driver: greenhouseDriver(page), saveResume, fullName: name, log }, app);
          if (outcome.result === "submitted") done.push(page);
        } catch (err) {
          log(`${app.id}: failed: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      log(`poll failed: ${(err as Error).message}`);
    }
    for (let waited = 0; waited < POLL_MS && !stopping; waited += 500) await new Promise((r) => setTimeout(r, 500));
  }
  await rm(files, { recursive: true, force: true });
  await browser.close().catch(() => undefined);
  log("apply runner stopped");
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
