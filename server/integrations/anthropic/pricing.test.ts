import { describe, expect, it } from "vitest";
import { costUsd } from "./pricing";

describe("costUsd", () => {
  it("prices input, output and cache tokens", () => {
    // 2,000 in × $0.10 + 500 out × $0.50 per million = $0.00045
    expect(costUsd("claude-haiku-5-5", { input_tokens: 2000, output_tokens: 500 })).toBeCloseTo(0.00045, 6);
    // 10,000 cache reads at 0.1× = $0.0001; 4,000 cache writes at 1.25× = $0.0005
    expect(
      costUsd("claude-haiku-5-5", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 10000, cache_creation_input_tokens: 4000 }),
    ).toBeCloseTo(0.0006, 6);
  });

  it("prices unknown models as Opus so spend isn't under-counted", () => {
    expect(costUsd("mystery-model", { input_tokens: 1_000_000, output_tokens: 0 })).toBe(4);
  });
});
