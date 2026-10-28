import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

const valid = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  OWNER_USER_ID: "00000000-0000-4000-8000-000000000001",
};

describe("parseServerEnv", () => {
  it("accepts a complete environment", () => {
    expect(parseServerEnv(valid).OWNER_USER_ID).toBe(valid.OWNER_USER_ID);
  });

  it("names missing variables without echoing values", () => {
    const secret = "super-secret-service-key";
    const fn = () => parseServerEnv({ ...valid, SUPABASE_SERVICE_ROLE_KEY: secret, OWNER_USER_ID: undefined });
    expect(fn).toThrow(/OWNER_USER_ID/);
    expect(fn).not.toThrow(new RegExp(secret));
  });

  it("rejects a non-uuid owner id", () => {
    expect(() => parseServerEnv({ ...valid, OWNER_USER_ID: "me" })).toThrow(/OWNER_USER_ID/);
  });
});
