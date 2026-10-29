import { describe, expect, it } from "vitest";
import { declineOption, factValue, normalizeQuestion, shapeAnswer } from "./answers";

const facts = [
  { category: "authorization", fact: "Authorized to work in the United States; does not require visa sponsorship." },
  { category: "logistics", fact: "Based in Houston, TX; prefers remote work; not willing to relocate." },
  { category: "link", fact: "LinkedIn: https://www.linkedin.com/in/someone." },
  { category: "link", fact: "GitHub: https://github.com/someone" },
];

const select = (...labels: string[]) => ({
  fieldType: "select" as const,
  options: labels.map((label, i) => ({ label, value: String(i) })),
});

describe("factValue", () => {
  it("reads fact topics from confirmed facts", () => {
    expect(factValue("work_authorization", facts)).toBe(true);
    expect(factValue("requires_sponsorship", facts)).toBe(false);
    expect(factValue("current_location", facts)).toBe("Houston, TX");
    expect(factValue("linkedin_url", facts)).toBe("https://www.linkedin.com/in/someone");
    expect(factValue("github_url", facts)).toBe("https://github.com/someone");
    expect(factValue("website_url", facts)).toBeNull();
  });

  it("returns null when no fact states it", () => {
    expect(factValue("requires_sponsorship", [])).toBeNull();
    expect(factValue("unknown_topic", facts)).toBeNull();
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
