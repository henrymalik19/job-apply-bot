import { describe, expect, it } from "vitest";
import { matchCriteriaSchema } from "@/server/modules/criteria/match-criteria";
import {
  companyFilter,
  dealbreakerFilter,
  hardFilter,
  salaryFilter,
  seniorityFilter,
  titleSeniority,
  type MatchableJob,
} from "./hard-filters";

const job = (j: Partial<MatchableJob> = {}): MatchableJob => ({
  title: "Senior Software Engineer",
  company_name: "Acme",
  description_md: "Build APIs in TypeScript.",
  salary_min: null,
  salary_max: null,
  ...j,
});
const criteria = (c: Record<string, unknown> = {}) => matchCriteriaSchema.parse(c);

describe("titleSeniority", () => {
  it.each([
    ["Senior Software Engineer", "senior"],
    ["Sr. Backend Engineer", "senior"],
    ["Staff Software Engineer", "staff"],
    ["Senior Staff Engineer", "staff"],
    ["Principal Engineer", "principal"],
    ["Engineering Manager, Payments", "manager"],
    ["Software Engineer II", "mid"],
    ["Software Engineer Intern", "junior"],
    ["Software Engineer", null],
  ] as const)("%s → %s", (title, level) => {
    expect(titleSeniority(title)).toBe(level);
  });
});

describe("seniorityFilter", () => {
  const c = criteria({ seniority: ["senior", "staff", "principal", "lead"] });
  it("keeps wanted levels and titles with no level", () => {
    expect(seniorityFilter(job({ title: "Staff Engineer" }), c)).toBeNull();
    expect(seniorityFilter(job({ title: "Software Engineer" }), c)).toBeNull();
  });
  it("rules out unwanted levels", () => {
    expect(seniorityFilter(job({ title: "Software Engineer II" }), c)).toBe("seniority: mid");
    expect(seniorityFilter(job({ title: "Engineering Manager" }), c)).toBe("seniority: manager");
  });
  it("keeps everything when no levels are chosen", () => {
    expect(seniorityFilter(job({ title: "Junior Developer" }), criteria())).toBeNull();
  });
});

describe("salaryFilter", () => {
  const c = criteria({ salary_min: 150000 });
  it("rules out ranges entirely below the floor", () => {
    expect(salaryFilter(job({ salary_min: 100000, salary_max: 130000 }), c)).toBe("salary: 130000 below 150000");
  });
  it("keeps ranges that reach the floor, and unknown salaries", () => {
    expect(salaryFilter(job({ salary_min: 120000, salary_max: 160000 }), c)).toBeNull();
    expect(salaryFilter(job(), c)).toBeNull();
  });
});

describe("dealbreakerFilter", () => {
  it("matches whole words in the title or description", () => {
    const c = criteria({ dealbreakers: ["clearance", "on call"] });
    expect(dealbreakerFilter(job({ description_md: "Requires TS/SCI clearance." }), c)).toBe("dealbreaker: clearance");
    expect(dealbreakerFilter(job({ title: "On-Call Engineer" }), c)).toBe("dealbreaker: on call");
    expect(dealbreakerFilter(job({ description_md: "Clear docs." }), c)).toBeNull();
  });
});

describe("companyFilter", () => {
  it("rules out excluded companies, ignoring case and punctuation", () => {
    const c = criteria({ excluded_companies: ["Second Nature"] });
    expect(companyFilter(job({ company_name: "second-nature" }), c)).toBe("excluded company: Second Nature");
    expect(companyFilter(job({ company_name: "Secondary" }), c)).toBeNull();
  });
});

describe("hardFilter", () => {
  it("returns the first failure, or null when everything passes", () => {
    const c = criteria({ excluded_companies: ["Acme"], dealbreakers: ["typescript"] });
    expect(hardFilter(job(), c)).toBe("excluded company: Acme");
    expect(hardFilter(job({ company_name: "Other" }), c)).toBe("dealbreaker: typescript");
    expect(hardFilter(job({ company_name: "Other", description_md: "Go" }), c)).toBeNull();
  });
});
