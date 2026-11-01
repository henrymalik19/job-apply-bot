import { describe, expect, it } from "vitest";
import { buildFillPlan, changedFields, type PlanQuestion } from "./fill-plan";

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

  it("falls back to the answer text when the value isn't an option value", () => {
    const plan = buildFillPlan([q({ field_type: "select", options: [{ label: "Yes", value: "1" }], answer: "Yes", answer_value: "Yes" })]);
    expect(plan.steps[0]).toMatchObject({ kind: "select", value: ["Yes"] });
  });

  it("blocks on required fields without an answer or a file it can't attach", () => {
    const plan = buildFillPlan([
      q({ question: "Why us?", required: true }),
      q({ question: "Portfolio", field_type: "file", required: true }),
      q({ question: "Optional note" }),
      q({ question: "Cover Letter", field_name: "cover_letter", field_type: "file" }),
    ]);
    expect(plan.blockers).toEqual(['"Why us?" has no answer', '"Portfolio" needs a file']);
    expect(plan.steps).toEqual([]);
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
