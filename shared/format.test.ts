import { describe, expect, it } from "vitest";
import { ago, formatSalary } from "./format";

describe("formatSalary", () => {
  it.each([
    [150000, 190000, "USD", "$150k–190k"],
    [120000, null, "USD", "$120k+"],
    [null, 90000, "EUR", "€90k"],
    [80000, 80000, "GBP", "£80k"],
    [100000, 120000, "CAD", "100k–120k CAD"],
    [null, null, "USD", ""],
  ] as const)("%s–%s %s → %s", (min, max, cur, expected) => {
    expect(formatSalary(min, max, cur)).toBe(expected);
  });
});

describe("ago", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  it.each([
    [null, "never"],
    ["2026-10-29T11:59:30Z", "30s ago"],
    ["2026-10-29T11:15:00Z", "45m ago"],
    ["2026-10-29T07:00:00Z", "5h ago"],
    ["2026-10-26T12:00:00Z", "3d ago"],
  ] as const)("%s → %s", (iso, expected) => {
    expect(ago(iso, now)).toBe(expected);
  });
});
