import type { Db, Insert } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";

/** Records one LLM call. */
export async function insertUsage(
  db: Db,
  row: Pick<Insert<"llm_calls">, "purpose" | "model" | "input_tokens" | "output_tokens" | "cache_read_tokens" | "cache_write_tokens" | "cost_usd" | "job_id">,
): Promise<void> {
  check(await db.from("llm_calls").insert(row), "record llm usage");
}

/** Total LLM spend (dollars) since a time, paged past the 1,000-row limit. */
export async function spendSince(db: Db, since: Date): Promise<number> {
  let total = 0;
  for (let from = 0; ; from += 1000) {
    const rows = unwrap(
      await db.from("llm_calls").select("cost_usd").gte("created_at", since.toISOString()).order("id").range(from, from + 999),
      "sum llm spend",
    );
    for (const r of rows) total += Number(r.cost_usd);
    if (rows.length < 1000) return total;
  }
}
