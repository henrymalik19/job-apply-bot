import { execSync } from "node:child_process";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    supabase: { url: string; anonKey: string; serviceRoleKey: string };
  }
}

// Points the tests at the local Supabase stack, never at a hosted project.
export default function setup(project: TestProject) {
  const out = execSync("pnpm exec supabase status -o json", { encoding: "utf8" });
  const status = JSON.parse(out.slice(out.indexOf("{")));
  const supabase = { url: status.API_URL, anonKey: status.ANON_KEY, serviceRoleKey: status.SERVICE_ROLE_KEY };
  if (!supabase.url || !supabase.anonKey || !supabase.serviceRoleKey) {
    throw new Error("supabase status is missing API_URL/ANON_KEY/SERVICE_ROLE_KEY; is the local stack running?");
  }
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(supabase.url)) {
    throw new Error("refusing to run DB tests against a non-local Supabase");
  }
  project.provide("supabase", supabase);
}
