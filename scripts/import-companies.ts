// Imports companies exported from the old app (data/old/companies.json, git-ignored).
// Keeps boards that listed at least one remote role matching the search; priority
// is that role count (capped at 100). Re-running updates name/priority in place
// but never `active`, so boards paused in the admin UI stay paused.
//   pnpm import:companies -- --exclude "Second Nature"
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseWorkerEnv } from "../lib/env";
import { BOARD_ATS, BOARD_TOKEN } from "../lib/discover/sources";

const exported = z.array(
  z.object({
    name: z.string(),
    ats: z.enum(BOARD_ATS),
    board_token: z.string(),
    remote_fit_roles: z.number(),
  }),
);

function excludedNames(argv: string[]): Set<string> {
  const names = new Set<string>();
  for (let i = 0; i < argv.length; i++) if (argv[i] === "--exclude" && argv[i + 1]) names.add(argv[++i].toLowerCase());
  return names;
}

async function main() {
  const env = parseWorkerEnv(process.env);
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const exclude = excludedNames(process.argv.slice(2));

  const wanted = exported
    .parse(JSON.parse(readFileSync("data/old/companies.json", "utf8")))
    .filter((c) => c.remote_fit_roles > 0 && !exclude.has(c.name.toLowerCase()));
  const invalid = wanted.filter((c) => !BOARD_TOKEN.test(c.board_token)).map((c) => c.board_token);
  const rows = wanted
    .filter((c) => BOARD_TOKEN.test(c.board_token))
    .map((c) => ({
      name: c.name,
      ats: c.ats,
      board_token: c.board_token,
      priority: Math.min(c.remote_fit_roles, 100),
    }));

  const { error } = await db.from("companies").upsert(rows, { onConflict: "ats,board_token" });
  if (error) throw new Error(`import failed: ${error.message}`);
  console.log(JSON.stringify({ ok: true, imported: rows.length, excluded: [...exclude], invalidTokens: invalid }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  process.exit(1);
});
