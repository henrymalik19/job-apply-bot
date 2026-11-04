"use server";

import { refresh } from "next/cache";
import { ownerContext, requireOwner } from "@/server/auth/require-owner";
import { ValidationError } from "@/server/core/errors";
import { switchBoard } from "@/server/modules/companies/companies.service";
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

/** Points a company at the board it moved to; returns an error message or null. */
export async function switchBoardAction(companyId: string, ats: string, boardToken: string): Promise<string | null> {
  const { db } = await ownerContext();
  try {
    await switchBoard(db, companyId, { ats, board_token: boardToken });
  } catch (err) {
    if (err instanceof ValidationError) return err.message;
    throw err;
  }
  refresh();
  return null;
}
