import { describe, expect, it } from "vitest";
import { asPickerDate, buildFillPlan, changedFields, educationSteps, employmentSteps, greenhouseDegree, greenhouseExtras, samePlace, sameText, type FillStep, type PlanQuestion } from "./fill-plan";

const q = (over: Partial<PlanQuestion>): PlanQuestion => ({
  question: "Q",
  field_name: "question_1",
  field_type: "text",
  options: null,
  required: false,
  answer: null,
  answer_value: null,
  ...over,
});

describe("buildFillPlan", () => {
  it("types text, picks option labels and attaches the resume", () => {
    const plan = buildFillPlan([
      q({ question: "First Name", field_name: "first_name", answer: "Ada", answer_value: "Ada" }),
      q({ question: "Resume/CV", field_name: "resume", field_type: "file", answer: "Tailored resume (PDF)" }),
      q({
        question: "Sponsorship?",
        field_name: "question_2",
        field_type: "select",
        options: [{ label: "No", value: "11" }, { label: "Yes", value: "12" }],
        answer: "No",
        answer_value: "11",
      }),
      q({
        question: "Languages",
        field_name: "question_3",
        field_type: "multiselect",
        options: [{ label: "Go", value: "1" }, { label: "Rust", value: "2" }],
        answer: "Go, Rust",
        answer_value: ["1", "2"],
      }),
    ]);
    expect(plan.blockers).toEqual([]);
    expect(plan.steps).toEqual([
      { kind: "text", fieldName: "first_name", label: "First Name", required: false, value: "Ada" },
      { kind: "resume", fieldName: "resume", label: "Resume/CV", required: false },
      { kind: "select", fieldName: "question_2", label: "Sponsorship?", required: false, value: ["No"] },
      { kind: "select", fieldName: "question_3", label: "Languages", required: false, value: ["Go", "Rust"] },
    ]);
  });

  it("declines a voluntary question left blank when the form offers that", () => {
    const options = [{ label: "Man", value: "1" }, { label: "I don't wish to answer", value: "2" }];
    const plan = buildFillPlan([
      q({ question: "Gender identity", field_name: "demographic_4", field_type: "multiselect", options }),
      q({ question: "Referred?", field_name: "question_9", field_type: "select", options: [{ label: "Yes", value: "1" }, { label: "No", value: "0" }] }),
    ]);
    expect(plan.steps).toEqual([{ kind: "decline", fieldName: "demographic_4", label: "Gender identity", required: false }]);
  });

  it("answers No to an unanswered referral question", () => {
    const plan = buildFillPlan([
      q({ question: "Were you referred to this role by a current employee?", field_name: "question_7", field_type: "select", options: [{ label: "Yes", value: "1" }, { label: "No", value: "0" }] }),
      q({ question: "If yes, please provide the full name of the employee who referred you.", field_name: "question_8" }),
    ]);
    expect(plan.steps).toEqual([{ kind: "select", fieldName: "question_7", label: "Were you referred to this role by a current employee?", required: false, value: ["No"] }]);
  });

  it("falls back to the answer text when the value isn't an option value", () => {
    const plan = buildFillPlan([q({ field_type: "select", options: [{ label: "Yes", value: "1" }], answer: "Yes", answer_value: "Yes" })]);
    expect(plan.steps[0]).toMatchObject({ kind: "select", value: ["Yes"] });
  });

  it("blocks on required fields without an answer", () => {
    const plan = buildFillPlan([q({ question: "Why us?", required: true }), q({ question: "Optional note" })]);
    expect(plan.blockers).toEqual(['"Why us?" has no answer']);
    expect(plan.steps).toEqual([]);
  });

  it("leaves steps only you can do to you: required files and assessments", () => {
    const plan = buildFillPlan([
      q({ question: "Portfolio", field_type: "file", required: true }),
      q({ question: "Coding challenge", required: true, bucket: "cannot_automate" }),
      q({ question: "Cover Letter", field_name: "cover_letter", field_type: "file" }),
      q({ question: "Name", required: true, answer: "Ada" }),
    ]);
    expect(plan.blockers).toEqual([]);
    expect(plan.yours).toEqual(["Portfolio", "Coding challenge"]);
    expect(plan.steps.map((s) => s.label)).toEqual(["Name"]);
  });

  it("skips hidden fields and rows without a field name", () => {
    expect(buildFillPlan([q({ field_type: "hidden", answer: "x" }), q({ field_name: null, answer: "x" })]).steps).toEqual([]);
  });
});

describe("changedFields", () => {
  const plan = buildFillPlan([
    q({ question: "Name", field_name: "a", answer: "Ada  Lovelace" }),
    q({ question: "Pick", field_name: "b", field_type: "select", answer: "No", answer_value: "No" }),
    q({ question: "Resume", field_name: "resume", field_type: "file" }),
  ]);

  it("ignores whitespace and fields it couldn't read", () => {
    expect(changedFields(plan.steps, { a: "Ada Lovelace" })).toEqual([]);
  });

  it("names fields whose value changed", () => {
    expect(changedFields(plan.steps, { a: "Ada", b: "Yes", resume: "x.pdf" })).toEqual(["Name", "Pick"]);
  });
});

describe("samePlace", () => {
  const where = buildFillPlan([q({ question: "Location", field_name: "loc", answer: "Atlanta, GA" })]);

  it("counts the place a search box picked, or the country it's in, as the same answer", () => {
    expect(changedFields(where.steps, { loc: "Atlanta, Georgia, United States" })).toEqual([]);
    expect(changedFields(where.steps, { loc: "United States" })).toEqual([]);
    expect(samePlace("Georgia", "Atlanta, GA")).toBe(true);
  });

  it("still names a different place as changed", () => {
    expect(changedFields(where.steps, { loc: "Denver, CO" })).toEqual(["Location"]);
    expect(changedFields(where.steps, { loc: "Canada" })).toEqual(["Location"]);
  });
});

describe("sameText", () => {
  it("matches phone numbers by their digits", () => {
    expect(sameText("(704) 555-0100", "7045550100")).toBe(true);
    expect(sameText("(704) 555-0199", "7045550100")).toBe(false);
    expect(sameText("Ada  Lovelace ", "Ada Lovelace")).toBe(true);
    expect(sameText("Ada", "Ada Lovelace")).toBe(false);
  });
});

describe("education", () => {
  it("maps degrees onto Greenhouse's list", () => {
    expect(["B.S.", "Bachelor of Science", "BA", "M.S. Computer Science", "MBA", "Ph.D.", "Associate of Science", "Certificate"].map(greenhouseDegree)).toEqual([
      "Bachelor's Degree", "Bachelor's Degree", "Bachelor's Degree", "Master's Degree",
      "Master of Business Administration (M.B.A.)", "Doctor of Philosophy (Ph.D.)", "Associate's Degree", "Other",
    ]);
  });

  it("fills school, degree, discipline and years, leaving out what the profile lacks", () => {
    expect(educationSteps({ institution: "Georgia State University", degree: "B.S.", fieldOfStudy: "Computer Science", startYear: 2012, endYear: 2016 }).map((s) => [s.fieldName, "value" in s ? s.value : null])).toEqual([
      ["school--0", "Georgia State University"],
      ["degree--0", ["Bachelor's Degree"]],
      ["discipline--0", "Computer Science"],
      ["start-year--0", "2012"],
      ["end-year--0", "2016"],
    ]);
    expect(educationSteps({ institution: "Self-taught", degree: null, fieldOfStudy: null, startYear: null, endYear: null }).map((s) => s.fieldName)).toEqual(["school--0"]);
  });
});

describe("employmentSteps", () => {
  const shown = (steps: FillStep[]) => steps.map((s) => [s.fieldName, "value" in s ? s.value : null]);
  it("fills a current job with its start date and ticks Current role", () => {
    expect(shown(employmentSteps({ employer: "Acme", title: "Senior Engineer", startDate: "2021-03-01", endDate: null, isCurrent: true }))).toEqual([
      ["company-name-0", "Acme"],
      ["title-0", "Senior Engineer"],
      ["start-date-month-0", ["March"]],
      ["start-date-year-0", "2021"],
      ["current-role-0", true],
    ]);
  });
  it("fills a past job's end date instead", () => {
    expect(shown(employmentSteps({ employer: "Beta", title: "Engineer", startDate: "2018-06-15", endDate: "2021-02-28", isCurrent: false })).slice(4)).toEqual([
      ["end-date-month-0", ["February"]],
      ["end-date-year-0", "2021"],
    ]);
  });
});

describe("greenhouseExtras", () => {
  it("fills Country, Location when there is a city, the demographic consent, and declines self-identification", () => {
    const eeoc = ["gender", "hispanic_ethnicity", "race", "veteran_status", "disability_status"].map((f) => [f, "decline"]);
    expect(greenhouseExtras({ city: "Atlanta", stateName: "Georgia", country: "United States" }).map((s) => [s.fieldName, "value" in s ? s.value : s.kind])).toEqual([
      ["country", ["United States"]],
      ["candidate-location", "Atlanta, Georgia"],
      ["gdpr_demographic_data_consent_given", true],
      ...eeoc,
    ]);
    expect(greenhouseExtras({ city: null, stateName: null, country: "United States" }).map((s) => s.fieldName).slice(0, 2)).toEqual(["country", "gdpr_demographic_data_consent_given"]);
  });

  it("counts a longer picked option or a reformatted phone as unchanged", () => {
    const steps: FillStep[] = [
      { kind: "location", fieldName: "loc", label: "Location", required: false, value: "Atlanta, Georgia" },
      { kind: "text", fieldName: "phone", label: "Phone", required: true, value: "7045550100" },
    ];
    expect(changedFields(steps, { loc: "Atlanta, Georgia, United States", phone: "(704) 555-0100" })).toEqual([]);
    expect(changedFields(steps, { loc: "Atlanta, Texas, United States", phone: "(704) 555-0100" })).toEqual(["Location"]);
  });
});

describe("asPickerDate", () => {
  const now = new Date(2026, 10, 6, 15, 30);
  it("turns when you could start into a date to type", () => {
    expect(asPickerDate("immediately available", now)).toBe("11/06/2026");
    expect(asPickerDate("ASAP", now)).toBe("11/06/2026");
    expect(asPickerDate("2 weeks", now)).toBe("11/20/2026");
    expect(asPickerDate("Two weeks notice", now)).toBe("11/20/2026");
    expect(asPickerDate("30 days", now)).toBe("12/06/2026");
    expect(asPickerDate("1 month", now)).toBe("12/06/2026");
  });
  it("keeps a date, moving one already past to today", () => {
    expect(asPickerDate("2026-12-01", now)).toBe("12/01/2026");
    expect(asPickerDate("1/5/2027", now)).toBe("01/05/2027");
    expect(asPickerDate("December 1, 2026", now)).toBe("12/01/2026");
    expect(asPickerDate("2026-01-01", now)).toBe("11/06/2026");
  });
  it("names no date for anything else", () => {
    expect(asPickerDate("Yes", now)).toBeNull();
    expect(asPickerDate("", now)).toBeNull();
    expect(asPickerDate("Negotiable", now)).toBeNull();
  });
});
