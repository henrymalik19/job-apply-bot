import { describe, expect, it } from "vitest";
import { jobFilterSchema, parseLocations, passesJobFilter, type FilterableJob } from "./job-filter";

const now = new Date("2026-10-29T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const job = (j: Partial<FilterableJob>): FilterableJob => ({ remote_type: "remote", locations: ["Remote (US)"], posted_at: daysAgo(3), ...j });
const filter = (f: Partial<ReturnType<typeof jobFilterSchema.parse>> = {}) => ({ ...jobFilterSchema.parse({}), ...f });

describe("passesJobFilter: age", () => {
  it("skips postings older than max_age_days and keeps undated ones", () => {
    expect(passesJobFilter(job({ posted_at: daysAgo(10) }), filter(), now)).toBe(true);
    expect(passesJobFilter(job({ posted_at: daysAgo(45) }), filter(), now)).toBe(false);
    expect(passesJobFilter(job({ posted_at: null }), filter(), now)).toBe(true);
    expect(passesJobFilter(job({ posted_at: daysAgo(80) }), filter({ max_age_days: 90 }), now)).toBe(true);
  });

  it("caps the age limit at 90 days and falls back to 30 for invalid values", () => {
    expect(jobFilterSchema.parse({ max_age_days: 400 }).max_age_days).toBe(30);
    expect(jobFilterSchema.parse({ max_age_days: 0 }).max_age_days).toBe(30);
    expect(jobFilterSchema.parse({ max_age_days: 90 }).max_age_days).toBe(90);
  });
});

describe("passesJobFilter: work type", () => {
  const f = filter({ work_types: ["remote", "hybrid"] });
  it("keeps chosen types and drops others", () => {
    expect(passesJobFilter(job({ remote_type: "hybrid" }), f, now)).toBe(true);
    expect(passesJobFilter(job({ remote_type: "onsite" }), f, now)).toBe(false);
  });
  it("keeps unknown types only when allowed", () => {
    expect(passesJobFilter(job({ remote_type: "unknown" }), f, now)).toBe(true);
    expect(passesJobFilter(job({ remote_type: "unknown" }), { ...f, keep_unknown_work_type: false }, now)).toBe(false);
  });
});

describe("passesJobFilter: locations", () => {
  const f = filter({ locations: ["United States", "New York", "SF"] });
  it("matches aliases and any listed location", () => {
    expect(passesJobFilter(job({ locations: ["Remote, USA"] }), f, now)).toBe(true);
    expect(passesJobFilter(job({ remote_type: "hybrid", locations: ["NYC"] }), f, now)).toBe(true);
    expect(passesJobFilter(job({ remote_type: "onsite", locations: ["San Francisco, CA"] }), f, now)).toBe(true);
    expect(passesJobFilter(job({ remote_type: "hybrid", locations: ["London", "U.S. Remote"] }), f, now)).toBe(true);
  });
  it("drops places not in the list", () => {
    expect(passesJobFilter(job({ remote_type: "onsite", locations: ["Berlin"] }), f, now)).toBe(false);
    expect(passesJobFilter(job({ locations: ["Remote (India)"] }), f, now)).toBe(false);
  });
  it("keeps remote jobs that name no place, unless switched off", () => {
    expect(passesJobFilter(job({ locations: ["Remote"] }), f, now)).toBe(true);
    expect(passesJobFilter(job({ locations: ["Remote"] }), { ...f, keep_remote_without_location: false }, now)).toBe(false);
    expect(passesJobFilter(job({ remote_type: "onsite", locations: ["Remote"] }), f, now)).toBe(false);
  });
  it("resolves cities and states to their country", () => {
    const us = filter({ locations: ["us"] });
    expect(passesJobFilter(job({ remote_type: "onsite", locations: ["Houston, TX"] }), us, now)).toBe(true);
    expect(passesJobFilter(job({ remote_type: "onsite", locations: ["Austin"] }), us, now)).toBe(true);
    expect(passesJobFilter(job({ remote_type: "onsite", locations: ["Denver, Colorado"] }), us, now)).toBe(true);
    expect(passesJobFilter(job({ remote_type: "onsite", locations: ["Toronto, ON, Canada"] }), us, now)).toBe(false);
  });

  it("matches states and city aliases", () => {
    expect(passesJobFilter(job({ remote_type: "onsite", locations: ["Dallas, TX"] }), filter({ locations: ["Texas"] }), now)).toBe(true);
    expect(passesJobFilter(job({ remote_type: "onsite", locations: ["Seattle, WA"] }), filter({ locations: ["TX"] }), now)).toBe(false);
    expect(passesJobFilter(job({ remote_type: "hybrid", locations: ["New York, NY"] }), filter({ locations: ["NYC"] }), now)).toBe(true);
    expect(passesJobFilter(job({ remote_type: "hybrid", locations: ["San Francisco, CA"] }), filter({ locations: ["SF"] }), now)).toBe(true);
  });

  it("treats unrecognized places as places, not as 'no location'", () => {
    const us = filter({ locations: ["US"] });
    expect(passesJobFilter(job({ locations: ["Vietnam"] }), us, now)).toBe(false);
    expect(passesJobFilter(job({ locations: ["Remote - China"] }), us, now)).toBe(false);
    expect(passesJobFilter(job({ locations: ["Global Remote"] }), us, now)).toBe(true);
    expect(passesJobFilter(job({ locations: ["Remote, Anywhere"] }), us, now)).toBe(true);
  });

  it("drops remote jobs limited to a non-US region", () => {
    expect(passesJobFilter(job({ locations: ["Remote - EMEA"] }), filter({ locations: ["US"] }), now)).toBe(false);
  });

  it("falls back to whole-word text for unknown places", () => {
    expect(passesJobFilter(job({ remote_type: "onsite", locations: ["Reykjavik"] }), filter({ locations: ["reykjavik"] }), now)).toBe(true);
  });
});

describe("parseLocations", () => {
  it("splits on commas, semicolons and newlines", () => {
    expect(parseLocations("United States; New York\nSF, SF")).toEqual(["United States", "New York", "SF"]);
  });
});
