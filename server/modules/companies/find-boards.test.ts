import { describe, expect, it } from "vitest";
import { findBoards, findMovedBoard, guessTokens, parseBoardUrl } from "./companies.service";

describe("parseBoardUrl", () => {
  it("reads the token from each ATS's board pages", () => {
    expect(parseBoardUrl("https://job-boards.greenhouse.io/stripe/jobs/123")).toEqual({ ats: "greenhouse", board_token: "stripe" });
    expect(parseBoardUrl("boards.greenhouse.io/gitlab")).toEqual({ ats: "greenhouse", board_token: "gitlab" });
    expect(parseBoardUrl("https://job-boards.greenhouse.io/embed/job_app?for=pinterest&token=1")).toEqual({ ats: "greenhouse", board_token: "pinterest" });
    expect(parseBoardUrl("https://jobs.lever.co/palantir/abc-def")).toEqual({ ats: "lever", board_token: "palantir" });
    expect(parseBoardUrl("https://jobs.ashbyhq.com/ramp")).toEqual({ ats: "ashby", board_token: "ramp" });
  });

  it("ignores names and other sites", () => {
    expect(parseBoardUrl("Scale AI")).toBeNull();
    expect(parseBoardUrl("https://www.pinterestcareers.com/jobs")).toBeNull();
  });
});

describe("guessTokens", () => {
  it("tries joined, dashed and first-word forms without company suffixes", () => {
    expect(guessTokens("Scale AI, Inc.")).toEqual(["scaleai", "scale-ai", "scale"]);
    expect(guessTokens("Ramp")).toEqual(["ramp"]);
    expect(guessTokens("  ")).toEqual([]);
  });
});

describe("findBoards", () => {
  // Only greenhouse "scaleai" (2 jobs) and ashby "scale" (no jobs) exist.
  const fakeFetch = (async (url: string) => {
    if (url.includes("greenhouse.io/v1/boards/scaleai/")) {
      return Response.json({ jobs: [1, 2].map((id) => ({ id, title: `Engineer ${id}`, absolute_url: `https://x/${id}`, location: { name: "Remote" } })) });
    }
    if (url.includes("ashbyhq.com/posting-api/job-board/scale?")) return Response.json({ jobs: [] });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  it("tries a name on every ATS and keeps boards with jobs", async () => {
    const found = await findBoards("Scale AI", fakeFetch);
    expect(found.map((b) => [b.ats, b.board_token, b.count])).toEqual([["greenhouse", "scaleai", 2]]);
    expect(found[0].sampleTitles).toEqual(["Engineer 1", "Engineer 2"]);
  });

  it("checks a URL as given, even with no open jobs", async () => {
    expect(await findBoards("https://jobs.ashbyhq.com/scale", fakeFetch)).toEqual([{ ats: "ashby", board_token: "scale", count: 0, sampleTitles: [] }]);
  });
});

describe("findMovedBoard", () => {
  // Doctolib left Greenhouse (404) for Ashby under the same token.
  const fakeFetch = (async (url: string) => {
    if (url.includes("ashbyhq.com/posting-api/job-board/doctolib?")) {
      return Response.json({ jobs: [1, 2, 3].map((n) => ({ id: `a${n}`, title: `Engineer ${n}`, jobUrl: `https://jobs.ashbyhq.com/doctolib/a${n}`, isListed: true, location: "Paris" })) });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  it("finds the board a company moved to, never its current one", async () => {
    const moved = await findMovedBoard({ name: "Doctolib", ats: "greenhouse", board_token: "doctolib" }, fakeFetch);
    expect(moved).toMatchObject({ ats: "ashby", board_token: "doctolib", count: 3 });
    expect(await findMovedBoard({ name: "Doctolib", ats: "ashby", board_token: "doctolib" }, fakeFetch)).toBeNull();
  });

  it("finds nothing when the company has no board anywhere", async () => {
    expect(await findMovedBoard({ name: "Gone Co", ats: "lever", board_token: "goneco" }, fakeFetch)).toBeNull();
  });
});
