import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { serverEnv } from "@/shared/env";
import type { Database } from "./database.types";
import type { Db } from "./types";

/**
 * Creates a Supabase client that acts as the signed-in user from the request
 * cookies, so RLS applies. Used by the auth module; pages get it through
 * `ownerContext()` rather than calling this directly.
 */
export async function createUserClient(): Promise<Db> {
  // Session checks compare token expiry to the clock, so they must run per
  // request, never in a prerender pass (Cache Components).
  await connection();
  const env = serverEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // proxy.ts refreshes the session cookies instead.
        }
      },
    },
  });
}
