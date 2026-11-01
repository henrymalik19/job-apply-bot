import { z } from "zod";

// Server-only environment. Never import this from a client component.
const serverSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OWNER_USER_ID: z.string().uuid(),
});

// Workers (Railway) only need the service-role connection.
const workerSchema = serverSchema.pick({ SUPABASE_URL: true, SUPABASE_SERVICE_ROLE_KEY: true });

// The local apply runner signs in as the user, so it needs only the public URL and anon key.
const applySchema = serverSchema.pick({ SUPABASE_URL: true, SUPABASE_ANON_KEY: true });

/** Environment the local apply runner needs. */
export type ApplyEnv = z.infer<typeof applySchema>;

/** Validates the apply runner's environment (URL + anon key only). */
export function parseApplyEnv(source: Record<string, string | undefined>): ApplyEnv {
  return parse(applySchema, source);
}

/** Environment the web app needs (Vercel). */
export type ServerEnv = z.infer<typeof serverSchema>;
/** Environment a worker or script needs (Railway, local scripts). */
export type WorkerEnv = z.infer<typeof workerSchema>;

let cached: ServerEnv | undefined;

function parse<T>(schema: z.ZodType<T>, source: Record<string, string | undefined>): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    // Report variable names only, never values.
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${missing}`);
  }
  return result.data;
}

/**
 * Validates the web app's environment. Errors name the bad variables but never
 * echo their values.
 *
 * @param source - Usually `process.env`.
 */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  return parse(serverSchema, source);
}

/**
 * Validates a worker's environment (URL + service-role key only).
 *
 * @param source - Usually `process.env`.
 */
export function parseWorkerEnv(source: Record<string, string | undefined>): WorkerEnv {
  return parse(workerSchema, source);
}

/** The web app's environment, parsed once per process. */
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
