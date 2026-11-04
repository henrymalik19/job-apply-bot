"use server";

import { requireOwner } from "@/server/auth/require-owner";
import { RailwayError, runCronNow } from "@/server/integrations/railway/railway";
import { WORKERS } from "@/server/modules/runs/runs.service";
import { serverEnv } from "@/shared/env";

/** Asks Railway to run a worker now; returns an error message or null once the run is queued. */
export async function runWorkerAction(name: string): Promise<string | null> {
  await requireOwner();
  if (!WORKERS.some((w) => w.name === name)) return "Unknown worker.";
  const token = serverEnv().RAILWAY_TOKEN;
  if (!token) return "Set RAILWAY_TOKEN on Vercel to run workers from here.";
  try {
    await runCronNow(token, name);
  } catch (err) {
    if (err instanceof RailwayError) return err.message;
    throw err;
  }
  return null;
}
