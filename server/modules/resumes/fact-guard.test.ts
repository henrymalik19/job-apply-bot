import { describe, expect, it } from "vitest";
import type { ProfileData } from "@/server/modules/profile/profile.service";
import { guardResume, numbersIn } from "./fact-guard";
import { assembleResume, masterResume } from "./resume-doc";

const job = (id: string, employer: string, start: string, end: string | null, bullets: string[], skills: string[], current = false) => ({
  id, user_id: "u", employer, title: "Staff Engineer", location: "Remote", employment_type: null, start_date: start, end_date: end,
  is_current: current, description: null, sort_order: 0, created_at: "", updated_at: "", skills,
  responsibilities: bullets.map((text, i) => ({ id: `${id}-${i}`, employment_id: id, text, sort_order: i, created_at: "", updated_at: "" })),
});

const data: ProfileData = {
  profile: {
    user_id: "u", first_name: "Sam", last_name: "Lee", preferred_name: null, email: "sam@example.test", phone: null,
    city: "Houston", state: "TX", country: "US", postal_code: null, linkedin_url: null, github_url: null, website_url: null,
    headline: "Staff Software Engineer", summary: "Engineer with 9 years building APIs.", notice_period: null, created_at: "", updated_at: "",
  },
  workAuthorizations: [],
  employment: [
    job("hub", "HUB International", "2021-02-01", "2026-08-01", ["Cut API latency 40% by caching reads", "Led a team of 5 engineers"], ["TypeScript", "AWS"]),
    job("kin", "Kingsmen Software", "2020-03-01", "2021-02-01", ["Built a Node.js billing service handling $2M a month"], ["Node.js"]),
  ],
  education: [],
  skills: [{ skill_id: "s1", user_id: "u", name: "Postgres", normalized: "postgres", category: null, years_override: null, proficiency: null, last_used_year: null, sort_order: 0, created_at: "", updated_at: "" }],
  certifications: [],
};

const plan = {
  summary: "Staff engineer with 9 years building APIs in TypeScript.",
  experience: [
    { employment_id: "hub", bullets: ["Reduced API latency 40% with a read cache", "Led 5 engineers"] },
    { employment_id: "kin", bullets: ["Built a Node.js billing service processing $2M monthly"] },
  ],
  skills: ["TypeScript", "AWS", "Postgres"],
};

describe("numbersIn", () => {
  it("normalizes money, percents, multipliers and thousands", () => {
    expect([...numbersIn("Saved $2.5M, cut 40% and 3x faster; 1,200 users, 10+ teams")]).toEqual(["2.5m", "40%", "3x", "1200", "10+"]);
  });
});

describe("guardResume", () => {
  it("passes a plan that only rewords and reorders", () => {
    expect(guardResume(plan, data)).toEqual([]);
  });

  it("rejects a number that isn't in that job's responsibilities", () => {
    const inflated = { ...plan, experience: [{ employment_id: "hub", bullets: ["Cut API latency 55% by caching reads"] }] };
    expect(guardResume(inflated, data)).toEqual(['number "55%" in a HUB International bullet isn\'t in that job\'s responsibilities']);
  });

  it("rejects a number moved from another job", () => {
    const moved = { ...plan, experience: [{ employment_id: "hub", bullets: ["Handled $2M a month in billing"] }] };
    expect(guardResume(moved, data)[0]).toMatch(/"2m" in a HUB International bullet/);
  });

  it("rejects an invented job, another employer's name in a bullet, a new skill and a summary number", () => {
    const fake = {
      summary: "Engineer with 15 years of experience.",
      experience: [
        { employment_id: "google", bullets: ["Built search"] },
        { employment_id: "hub", bullets: ["Took over the Kingsmen Software billing work"] },
      ],
      skills: ["Rust"],
    };
    expect(guardResume(fake, data)).toEqual([
      'number "15" in the summary isn\'t in your profile',
      'unknown job "google"',
      "a HUB International bullet names another employer (Kingsmen Software)",
      'skill "Rust" isn\'t in your profile',
    ]);
  });
});

describe("resume documents", () => {
  it("fills employer, title and dates from the profile, newest first whatever the plan's order", () => {
    const doc = assembleResume({ ...plan, experience: [...plan.experience].reverse() }, data);
    expect(doc.experience.map((j) => [j.employer, j.title, j.dates])).toEqual([
      ["HUB International", "Staff Engineer", "Feb 2021 – Aug 2026"],
      ["Kingsmen Software", "Staff Engineer", "Mar 2020 – Feb 2021"],
    ]);
    expect(doc.name).toBe("Sam Lee");
    expect(doc.contact).toEqual(["Houston, TX", "sam@example.test"]);
  });

  it("always keeps a current job, even when the plan leaves it out", () => {
    const withCurrent = { ...data, employment: [job("sn", "Second Nature", "2026-08-01", null, [], [], true), ...data.employment] };
    const doc = assembleResume({ ...plan, experience: [plan.experience[1]] }, withCurrent);
    expect(doc.experience.map((j) => [j.employer, j.bullets.length])).toEqual([["Second Nature", 0], ["Kingsmen Software", 1]]);
  });

  it("builds the untailored resume from the profile", () => {
    const doc = masterResume(data);
    expect(doc.summary).toBe("Engineer with 9 years building APIs.");
    expect(doc.experience[0].bullets).toEqual(["Cut API latency 40% by caching reads", "Led a team of 5 engineers"]);
    expect(doc.skills).toEqual(["Postgres"]);
  });
});
