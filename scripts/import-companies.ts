// Imports companies exported from the old app (data/old/companies.json, git-ignored)
// and makes the owner follow them.
// See importCompanies() for which boards are kept.
//   pnpm import:companies -- --exclude "Second Nature"
import { readFileSync } from "node:fs";
import { z } from "zod";
import { createServiceClient } from "@/server/db/service-client";
import { exportedCompanySchema, importCompanies } from "@/server/modules/companies/companies.service";
import { ownerId } from "@/server/modules/users/users.service";
import { parseWorkerEnv } from "@/shared/env";

function excludedNames(argv: string[]): string[] {
  const names: string[] = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === "--exclude" && argv[i + 1]) names.push(argv[++i]);
  return names;
}

async function main() {
  const db = createServiceClient(parseWorkerEnv(process.env));
  const exported = z.array(exportedCompanySchema).parse(JSON.parse(readFileSync("data/old/companies.json", "utf8")));
  const exclude = excludedNames(process.argv.slice(2));
  const owner = await ownerId(db);
  if (!owner) throw new Error("No owner set; run pnpm owner:set first");
  const result = await importCompanies(db, owner, exported, exclude);
  console.log(JSON.stringify({ ok: true, ...result, excluded: exclude }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  process.exit(1);
});
