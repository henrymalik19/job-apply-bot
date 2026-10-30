// Thin wrapper over the Anthropic SDK for structured (JSON) calls. Workers and
// server actions use it through the StructuredCall type, so tests can swap in
// a fake and never call the API.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { TokenUsage } from "./pricing";

/** Model used for scoring and other cheap, high-volume calls. */
export const SCORING_MODEL = "claude-haiku-5-5";
/** Model used for writing: drafted answers and tailored resumes. */
export const DRAFTING_MODEL = "claude-sonnet-5-5";

/** One structured call's result: the parsed output (null when it didn't parse or was refused) plus usage. */
export type StructuredResult<T> = {
  output: T | null;
  model: string;
  usage: TokenUsage;
  /** Why `output` is null, when it is. */
  error?: string;
};

/** What a structured call needs. */
export type StructuredRequest<T> = {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
};

/** A structured call: system + user prompt in, schema-shaped JSON out. */
export type StructuredCall = <T>(request: StructuredRequest<T>) => Promise<StructuredResult<T>>;

/**
 * Creates a structured caller backed by the Anthropic API (key from
 * ANTHROPIC_API_KEY). The system prompt is marked cacheable so repeated calls
 * with the same instructions and profile pay for it once.
 *
 * @param model - Defaults to {@link SCORING_MODEL}.
 */
export function createClaudeCaller(model: string = SCORING_MODEL, client: Anthropic = new Anthropic()): StructuredCall {
  return async function call<T>({ system, user, schema, maxTokens = 4000, effort = "low" }: StructuredRequest<T>) {
    const response = await client.messages.parse({
      model,
      max_tokens: maxTokens,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      output_config: { format: zodOutputFormat(schema), effort },
    });
    const usage: TokenUsage = response.usage;
    const failed = (error: string): StructuredResult<T> => ({ output: null, model, usage, error });
    if (response.stop_reason === "refusal") {
      return failed(`refused (${response.stop_details?.category ?? "no category"})`);
    }
    if (response.stop_reason === "max_tokens") return failed("hit max_tokens");
    const output = response.parsed_output as T | null;
    return output == null ? failed("output did not match the schema") : { output, model, usage };
  };
}
