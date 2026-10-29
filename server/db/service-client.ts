import { createClient } from "@supabase/supabase-js";
import type { WorkerEnv } from "@/shared/env";
import type { Database } from "./database.types";
import type { Db } from "./types";

/**
 * Creates a service-role client, which bypasses RLS. For workers, scripts and
 * narrowly scoped server reads (e.g. the public_status view). Never import this
 * from client components and never return its rows to the browser unfiltered.
 *
 * Not marked `server-only` because workers run it under plain Node.
 *
 * @param env - Parsed environment with the project URL and service-role key.
 */
export function createServiceClient(env: WorkerEnv): Db {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
