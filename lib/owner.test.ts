import { describe, expect, it } from "vitest";
import { isOwnerId } from "./owner";

const OWNER = "00000000-0000-4000-8000-000000000001";

describe("isOwnerId", () => {
  it("matches only the configured owner", () => {
    expect(isOwnerId(OWNER, OWNER)).toBe(true);
    expect(isOwnerId("00000000-0000-4000-8000-000000000002", OWNER)).toBe(false);
  });

  it("rejects a missing user", () => {
    expect(isOwnerId(undefined, OWNER)).toBe(false);
    expect(isOwnerId("", OWNER)).toBe(false);
  });
});
