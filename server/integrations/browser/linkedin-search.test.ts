import { describe, expect, it } from "vitest";
import { linkedinSearchUrl, parseJobHead, searchWindowHours, splitPageTitle } from "./linkedin-search";

describe("LinkedIn search", () => {
  it("searches Easy Apply jobs posted recently, remote and where you are", () => {
    const url = new URL(linkedinSearchUrl({ keywords: "Senior Software Engineer", remoteOnly: true, location: "United States", maxAgeHours: 24 }));
    expect(url.pathname).toBe("/jobs/search-results/");
    expect(Object.fromEntries(url.searchParams)).toEqual({ keywords: "Senior Software Engineer remote", f_AL: "true", f_TPR: "r86400", geoId: "103644278" });
    const city = new URL(linkedinSearchUrl({ keywords: "Remote Staff Engineer", remoteOnly: true, location: "Atlanta, GA", maxAgeHours: 24 }));
    expect(Object.fromEntries(city.searchParams)).toMatchObject({ keywords: "Remote Staff Engineer", location: "Atlanta, GA" });
  });

  it("looks back to the last search, a day to a week", () => {
    const now = Date.parse("2026-11-06T18:00:00Z");
    const hoursAgo = (h: number) => now - h * 3_600_000;
    expect(searchWindowHours(null, now)).toBe(168);
    expect(searchWindowHours(hoursAgo(6), now)).toBe(24);
    expect(searchWindowHours(hoursAgo(30), now)).toBe(32);
    expect(searchWindowHours(hoursAgo(24 * 20), now)).toBe(168);
  });

  it("reads the title and company from the page title, even with | in the title", () => {
    expect(splitPageTitle("Senior Full-Stack Engineer (Frontend) Fully remote, USA | US$199K–$295K base + equity | Big Wave Digital - USA | LinkedIn"))
      .toEqual({ title: "Senior Full-Stack Engineer (Frontend) Fully remote, USA | US$199K–$295K base + equity", company: "Big Wave Digital - USA" });
    expect(splitPageTitle("(3) Staff Engineer | Acme | LinkedIn")).toEqual({ title: "Staff Engineer", company: "Acme" });
    expect(splitPageTitle("Feed | LinkedIn")).toBeNull();
  });

  it("reads where, when, pay and the work type from the lines above the description", () => {
    const now = new Date("2026-11-06T12:00:00Z");
    const head = "Big Wave Digital - USA\n\nSenior Engineer\n\nUnited States · 2 hours ago · 45 applicants\n\nPromoted by hirer\n\n$198.8K/yr - $295K/yr\nRemote\nFull-time\nEasy Apply\nSave";
    expect(parseJobHead(head, now)).toEqual({
      location: "United States", remoteType: "remote", salaryMin: 198800, salaryMax: 295000, postedAt: "2026-11-06T10:00:00.000Z",
    });
    expect(parseJobHead("Acme\n\nAtlanta, GA (Hybrid) · 3 days ago\n\n$60/hr\nHybrid", now)).toMatchObject({ location: "Atlanta, GA", remoteType: "hybrid", salaryMin: null, salaryMax: null });
  });
});
