import { describe, expect, it } from "vitest";
import type { ProfileData } from "@/server/modules/profile/profile.service";
import { declineOption, isProfileTopic, normalizeQuestion, profileValue, shapeAnswer } from "./answers";

const now = new Date("2026-10-01T00:00:00Z");
const job = (employer: string, start: string, end: string | null, skills: string[], current = false) => ({
  id: employer, employer, title: "Engineer", location: null, employment_type: null, start_date: start, end_date: end,
  is_current: current, description: null, sort_order: 0, created_at: "", updated_at: "", responsibilities: [], skills,
});
const data: ProfileData = {
  profile: {
    user_id: "u", first_name: "Sam", last_name: "Lee", preferred_name: null, email: "sam@example.test", phone: null,
    city: "Houston", state: "TX", country: "US", postal_code: null, linkedin_url: "https://www.linkedin.com/in/someone",
    github_url: null, website_url: null, headline: null, summary: null, willing_to_relocate: false, notice_period: null,
    created_at: "", updated_at: "",
  },
  workAuthorizations: [{ id: "a", country: "US", authorized: true, requires_sponsorship: false, status: null, notes: null, created_at: "", updated_at: "" }],
  employment: [job("A", "2019-01-01", "2022-01-01", ["AWS"]), job("B", "2021-01-01", null, ["AWS", "TypeScript"], true)],
  education: [],
  skills: [{ skill_id: "s1", name: "Kubernetes", normalized: "kubernetes", aliases: ["k8s"], category: null, years_override: 3, proficiency: null, last_used_year: null, sort_order: 0, created_at: "", updated_at: "" }],
  certifications: [],
  facts: [],
};
const opts = { country: "US", now };

const select = (...labels: string[]) => ({
  fieldType: "select" as const,
  options: labels.map((label, i) => ({ label, value: String(i) })),
});

describe("profileValue", () => {
  it("reads profile topics from the structured profile", () => {
    expect(profileValue("full_name", data, opts)).toBe("Sam Lee");
    expect(profileValue("current_location", data, opts)).toBe("Houston, TX");
    expect(profileValue("linkedin_url", data, opts)).toBe("https://www.linkedin.com/in/someone");
    expect(profileValue("willing_to_relocate", data, opts)).toBe(false);
    expect(profileValue("github_url", data, opts)).toBeNull();
  });

  it("answers work authorization for the posting's country only", () => {
    expect(profileValue("work_authorization", data, opts)).toBe(true);
    expect(profileValue("requires_sponsorship", data, opts)).toBe(false);
    expect(profileValue("requires_sponsorship", data, { ...opts, country: "CA" })).toBeNull();
  });

  it("computes years with a skill from overlapping jobs, or uses the override", () => {
    expect(profileValue("years:aws", data, opts)).toBe(7.8); // Jan 2019 – Oct 2026, overlap counted once
    expect(profileValue("years:TypeScript", data, opts)).toBe(5.8);
    expect(profileValue("years:k8s", data, opts)).toBe(3);
    expect(profileValue("years:cobol", data, opts)).toBeNull();
    expect(isProfileTopic("years:go") && isProfileTopic("email") && !isProfileTopic("salary_expectation")).toBe(true);
  });
});

describe("shapeAnswer", () => {
  it("fits yes/no values to booleans, selects and text, flipping inverted wordings", () => {
    expect(shapeAnswer({ fieldType: "boolean", options: [] }, false)).toEqual({ answer: "No", value: false });
    expect(shapeAnswer(select("Yes", "No"), false)).toEqual({ answer: "No", value: "1" });
    expect(shapeAnswer(select("Yes, I will require sponsorship", "No, I will not"), false, true)).toEqual({ answer: "Yes, I will require sponsorship", value: "0" });
    expect(shapeAnswer({ fieldType: "text", options: [] }, true)).toEqual({ answer: "Yes", value: "Yes" });
    expect(shapeAnswer(select("Maybe", "Unsure"), true)).toBeNull();
  });

  it("picks the option range containing a number or the bottom of a salary range", () => {
    expect(shapeAnswer(select("0-2 years", "3-5 years", "6-9 years", "10+ years"), 8)?.answer).toBe("6-9 years");
    expect(shapeAnswer(select("Less than $120k", "$120k - $150k", "$150k - $180k", "$180k+"), { min: 160000, max: 190000 })?.answer).toBe("$150k - $180k");
    expect(shapeAnswer({ fieldType: "text", options: [] }, { min: 150000, max: 180000 })?.answer).toBe("$150,000–$180,000");
  });

  it("matches text to an option exactly or by US state", () => {
    expect(shapeAnswer(select("Alabama", "Texas", "N/A - I do not reside in the above states"), "Houston, TX")?.answer).toBe("Texas");
    expect(shapeAnswer(select("Email", "LinkedIn"), "linkedin")?.answer).toBe("LinkedIn");
    expect(shapeAnswer(select("A friend", "A recruiter"), "Company careers page")).toBeNull();
  });

  it("never fills file fields", () => {
    expect(shapeAnswer({ fieldType: "file", options: [] }, "resume.pdf")).toBeNull();
  });
});

describe("declineOption and normalizeQuestion", () => {
  it("picks the single decline option and normalizes wordings", () => {
    const q = { fieldType: "multiselect" as const, options: [{ label: "Asian", value: "1" }, { label: "Decline", value: "2", decline: true }] };
    expect(declineOption(q)).toEqual({ answer: "Decline", value: ["2"] });
    expect(normalizeQuestion("  Do you REQUIRE sponsorship? ")).toBe("do you require sponsorship");
  });
});
