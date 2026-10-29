/** Dollars per million tokens for the models this app uses (Anthropic list prices). */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

/** Token counts from one API response (`response.usage`). */
export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/**
 * Cost of one call in dollars. Cache reads bill at 0.1× input and cache
 * writes at 1.25× input. Unknown models are priced as Opus so spend is never
 * under-counted.
 */
export function costUsd(model: string, usage: TokenUsage): number {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const read = usage.cache_read_input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  const dollars =
    (usage.input_tokens * p.input + read * p.input * 0.1 + write * p.input * 1.25 + usage.output_tokens * p.output) /
    1_000_000;
  return Math.round(dollars * 1e6) / 1e6;
}
