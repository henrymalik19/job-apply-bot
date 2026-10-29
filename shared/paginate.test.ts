import { describe, expect, it } from "vitest";
import { paginate, parsePage } from "./paginate";

const rows = Array.from({ length: 120 }, (_, i) => i + 1);

describe("paginate", () => {
  it("returns the requested page with 1-based bounds", () => {
    expect(paginate(rows, 2, 50)).toMatchObject({ page: 2, pageCount: 3, total: 120, from: 51, to: 100 });
    expect(paginate(rows, 2, 50).items[0]).toBe(51);
  });

  it("returns a short last page", () => {
    expect(paginate(rows, 3, 50)).toMatchObject({ from: 101, to: 120 });
    expect(paginate(rows, 3, 50).items).toHaveLength(20);
  });

  it("clamps pages past the end and below 1", () => {
    expect(paginate(rows, 9, 50).page).toBe(3);
    expect(paginate(rows, 0, 50).page).toBe(1);
  });

  it("handles an empty list as one empty page", () => {
    expect(paginate([], 1, 50)).toMatchObject({ items: [], page: 1, pageCount: 1, total: 0, from: 0, to: 0 });
  });
});

describe("parsePage", () => {
  it.each([
    ["3", 3],
    [undefined, 1],
    ["0", 1],
    ["-2", 1],
    ["abc", 1],
    ["2.5", 1],
    [["4", "5"], 4],
  ] as const)("%j → %i", (input, expected) => {
    expect(parsePage(input as string | string[] | undefined)).toBe(expected);
  });
});
