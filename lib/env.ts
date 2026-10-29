import { z } from "zod";

// Server-only environment. Never import this from a client component.
const serverSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OWNER_USER_ID: z.string().uuid(),
});

// Workers (GitHub Actions) only need the service-role connection.
const workerSchema = serverSchema.pick({ SUPABASE_URL: true, SUPABASE_SERVICE_ROLE_KEY: true });

export type ServerEnv = z.infer<typeof serverSchema>;
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

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  return parse(serverSchema, source);
}

export function parseWorkerEnv(source: Record<string, string | undefined>): WorkerEnv {
  return parse(workerSchema, source);
}

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
