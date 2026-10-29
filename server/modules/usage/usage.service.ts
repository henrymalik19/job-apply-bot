// LLM spend tracking: every call is recorded with its token counts and cost,
// and workers stop calling the API for the month once the cap is reached.
import { z } from "zod";
import type { Db } from "@/server/db/types";
import { costUsd, type TokenUsage } from "@/server/integrations/anthropic/pricing";
import * as settings from "@/server/modules/settings/settings.service";
import { insertUsage, spendSince } from "./usage.repository";

/** Settings key for the monthly LLM spend cap in dollars. */
export const SPEND_CAP_KEY = "llm_monthly_cap_usd";
const DEFAULT_CAP_USD = 5;

/** First instant of the current calendar month (UTC). */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** This month's spend and the cap, in dollars. */
export async function getMonthlySpend(db: Db, now: Date): Promise<{ spent: number; cap: number }> {
  const [spent, cap] = await Promise.all([
    spendSince(db, monthStart(now)),
    settings.getSetting(db, SPEND_CAP_KEY).then((v) => z.number().positive().catch(DEFAULT_CAP_USD).parse(v)),
  ]);
  return { spent, cap };
}

/**
 * Records one LLM call and returns its cost in dollars.
 *
 * @param purpose - What the call was for, e.g. "score" or "suggest_titles".
 */
export async function recordUsage(
  db: Db,
  call: { purpose: string; model: string; usage: TokenUsage; jobId?: string | null },
): Promise<number> {
  const cost = costUsd(call.model, call.usage);
  await insertUsage(db, {
    purpose: call.purpose,
    model: call.model,
    input_tokens: call.usage.input_tokens,
    output_tokens: call.usage.output_tokens,
    cache_read_tokens: call.usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: call.usage.cache_creation_input_tokens ?? 0,
    cost_usd: cost,
    job_id: call.jobId ?? null,
  });
  return cost;
}
