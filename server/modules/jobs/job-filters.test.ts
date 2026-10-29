import { describe, expect, it } from "vitest";
import { filtersToParams, parseJobFilters } from "./job-filters";

describe("parseJobFilters", () => {
  it("uses defaults for an empty URL", () => {
    expect(parseJobFilters({})).toEqual({ q: "", remote: "any", state: "open", found: "any", posted: "30", sort: "found", match: "relevant" });
  });

  it("keeps valid values and falls back on invalid ones", () => {
    expect(parseJobFilters({ remote: "remote", state: "all", found: "7", sort: "posted" })).toMatchObject({
      remote: "remote", state: "all", found: "7", sort: "posted",
    });
    expect(parseJobFilters({ remote: "mars", found: "365", sort: "random" })).toMatchObject({
      remote: "any", found: "any", sort: "found",
    });
  });

  it("strips characters that would break the PostgREST or() filter", () => {
    expect(parseJobFilters({ q: '  staff,(engineer)%_ "x" ' }).q).toBe("staff engineer x");
  });

  it("takes the first value of repeated params", () => {
    expect(parseJobFilters({ remote: ["hybrid", "remote"] }).remote).toBe("hybrid");
  });
});

describe("filtersToParams", () => {
  it("keeps a non-default posted window", () => {
    expect(filtersToParams(parseJobFilters({ posted: "any" }))).toEqual({ posted: "any" });
  });

  it("drops defaults and empty values", () => {
    expect(filtersToParams(parseJobFilters({ q: "", remote: "remote", state: "open" }))).toEqual({ remote: "remote" });
  });
});
