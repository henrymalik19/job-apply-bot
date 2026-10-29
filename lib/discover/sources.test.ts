import { describe, expect, it } from "vitest";
import { boardUrl, parseBoard, remoteType } from "./sources";
import { ashbyBody, greenhouseBody, leverBody } from "./test-fixtures";

describe("boardUrl", () => {
  it("builds each ATS endpoint and encodes the token", () => {
    expect(boardUrl("greenhouse", "stripe")).toBe("https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true");
    expect(boardUrl("lever", "palantir")).toBe("https://api.lever.co/v0/postings/palantir?mode=json");
    expect(boardUrl("ashby", "ramp")).toBe("https://api.ashbyhq.com/posting-api/job-board/ramp?includeCompensation=true");
    expect(boardUrl("lever", "a/b")).toContain("a%2Fb");
  });
});

describe("parseBoard", () => {
  it("parses Greenhouse, decoding its escaped HTML and slimming raw", () => {
    const [job] = parseBoard("greenhouse", greenhouseBody([{ id: "123", title: "Engineer" }]));
    expect(job).toMatchObject({
      external_id: "123",
      title: "Engineer",
      location: "Remote - US",
      remote_type: "remote",
      url: "https://boards.greenhouse.io/acme/jobs/123",
      posted_at: "2026-10-01T14:00:00.000Z",
      salary_min: null,
    });
    expect(job.description_md).toBe("## About\n\nBuild things & ship.\n\n- TypeScript");
    expect(job.raw).not.toHaveProperty("content");
    expect(job.raw).not.toHaveProperty("offices");
    expect(job.raw).toHaveProperty("departments");
  });

  it("parses Lever with lists, yearly salary and workplace type", () => {
    const [job] = parseBoard("lever", leverBody([{ id: "abc", title: "Engineer" }]));
    expect(job).toMatchObject({
      external_id: "abc",
      apply_url: "https://jobs.lever.co/acme/abc/apply",
      remote_type: "hybrid",
      salary_min: 150000,
      salary_max: 190000,
      salary_currency: "USD",
    });
    expect(job.description_md).toBe("We build tools.\n\n## What you'll do\n- Ship features\n- Review code\n\nBenefits included.");
  });

  it("parses Ashby, trims titles, takes the yearly salary and drops unlisted jobs", () => {
    const body = ashbyBody([{ id: "x1", title: "Engineer" }], [
      { id: "hidden", title: "Secret", jobUrl: "https://jobs.ashbyhq.com/acme/hidden", isListed: false },
    ]);
    const jobs = parseBoard("ashby", body);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: "Engineer",
      remote_type: "onsite",
      salary_min: 200000,
      salary_max: 250000,
      salary_currency: "USD",
    });
  });

  it("rejects a payload of the wrong shape", () => {
    expect(() => parseBoard("greenhouse", { error: "not found" })).toThrow();
    expect(() => parseBoard("lever", { ok: false })).toThrow();
  });
});

describe("remoteType", () => {
  it.each([
    [["Remote - US"], "remote"],
    [["Hybrid", "NYC"], "hybrid"],
    [["OnSite"], "onsite"],
    [["on-site"], "onsite"],
    [[null, "Berlin"], "unknown"],
  ] as const)("%j → %s", (hints, expected) => {
    expect(remoteType(...hints)).toBe(expected);
  });
});
