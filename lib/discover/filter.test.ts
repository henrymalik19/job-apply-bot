import { describe, expect, it } from "vitest";
import { parseKeywords, passesTitleFilter } from "./filter";

describe("passesTitleFilter", () => {
  it("keeps everything when the filter is empty", () => {
    expect(passesTitleFilter("Anything", { include: [], exclude: [] })).toBe(true);
  });

  it("requires an include phrase when any are set", () => {
    const f = { include: ["engineer", "product manager"], exclude: [] };
    expect(passesTitleFilter("Senior Software Engineer", f)).toBe(true);
    expect(passesTitleFilter("Product Manager, Payments", f)).toBe(true);
    expect(passesTitleFilter("Account Executive", f)).toBe(false);
  });

  it("matches whole words only", () => {
    expect(passesTitleFilter("Engineering Manager", { include: ["engineer"], exclude: [] })).toBe(false);
    expect(passesTitleFilter("Sr. Engineer", { include: ["sr"], exclude: [] })).toBe(true);
  });

  it("lets exclude win over include", () => {
    const f = { include: ["engineer"], exclude: ["intern"] };
    expect(passesTitleFilter("Engineer Intern", f)).toBe(false);
  });
});

describe("parseKeywords", () => {
  it("splits on commas and newlines, trims and dedupes", () => {
    expect(parseKeywords(" engineer, manager\nengineer ,, ")).toEqual(["engineer", "manager"]);
  });
});
