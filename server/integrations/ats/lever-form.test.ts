import { describe, expect, it } from "vitest";
import { leverDescriptionHtml, parseLeverForm } from "./lever-form";

const json = (v: unknown) => JSON.stringify(v).replace(/"/g, "&quot;");
const CARD = { id: "c1", text: "Questions", fields: [
  { type: "multiple-choice", text: "Are you authorized to work in the US?", required: true, options: [{ text: "Yes" }, { text: "No" }] },
  { type: "textarea", text: "Why us?", required: false },
  { type: "multiple-select", text: "Languages", required: true, options: [{ text: "English" }, { text: "Spanish" }] },
] };
const SURVEY = { id: "s1", type: "survey", text: "Demographics", fields: [
  { type: "multiple-choice", text: "What best describes your gender?", required: true, options: [{ text: "Woman" }, { text: "Prefer not to disclose" }] },
] };
const PAGE = `<html><body><form id="application-form">
  <input type="file" name="resume">
  <input type="text" name="name" required>
  <input type="email" name="email" required>
  <input type="text" name="location" required>
  <input type="text" name="org">
  <input type="text" name="urls[LinkedIn]">
  <input type="hidden" value="${json(CARD)}" name="cards[c1][baseTemplate]">
  <input type="hidden" value="${json(SURVEY)}" name="surveysResponses[s1][baseTemplate]">
  <li class="application-question"><div class="application-label"><div class="text">Veteran status</div></div>
    <select name="eeo[veteran]"><option value="">Select…</option><option value="Veteran">I am a veteran</option><option value="Decline">Decline to self-identify</option></select></li>
</form></body></html>`;

describe("parseLeverForm", () => {
  const form = parseLeverForm(PAGE, "<p>Build things.</p>")!;
  const by = (name: string) => form.questions.find((q) => q.fieldName === name)!;

  it("reads the standard fields that are there, with whether each is required", () => {
    expect(form.questions.slice(0, 6).map((q) => [q.fieldName, q.fieldType, q.required])).toEqual([
      ["resume", "file", false],
      ["name", "text", true],
      ["email", "text", true],
      ["location", "location", true],
      ["org", "text", false],
      ["urls[LinkedIn]", "text", false],
    ]);
    expect(form.descriptionHtml).toBe("<p>Build things.</p>");
  });

  it("reads each card's questions from its embedded JSON, named after the card", () => {
    expect(by("cards[c1][field0]")).toMatchObject({ label: "Are you authorized to work in the US?", fieldType: "select", required: true, group: "application" });
    expect(by("cards[c1][field0]").options.map((o) => o.value)).toEqual(["Yes", "No"]);
    expect(by("cards[c1][field1]")).toMatchObject({ fieldType: "textarea", required: false });
    expect(by("cards[c1][field2]")).toMatchObject({ fieldType: "multiselect", required: true });
  });

  it("treats a survey card and eeo dropdowns as voluntary self-identification", () => {
    const survey = by("surveysResponses[s1][responses][field0]");
    expect(survey).toMatchObject({ group: "eeo", required: false });
    expect(survey.options.find((o) => o.decline)?.label).toBe("Prefer not to disclose");
    const veteran = by("eeo[veteran]");
    expect(veteran).toMatchObject({ label: "Veteran status", group: "eeo", fieldType: "select" });
    expect(veteran.options.map((o) => [o.value, o.decline])).toEqual([["Veteran", false], ["Decline", true]]);
  });

  it("finds no form on a page without one (a closed posting)", () => {
    expect(parseLeverForm("<html><body><h1>This job is no longer available</h1></body></html>", null)).toBeNull();
  });
});

describe("leverDescriptionHtml", () => {
  it("joins the description, its lists and the closing notes", () => {
    expect(leverDescriptionHtml({ description: "<p>Hi</p>", lists: [{ text: "You'll", content: "<li>Build</li>" }], additional: "<p>Bye</p>" })).toBe(
      "<p>Hi</p><h3>You'll</h3><ul><li>Build</li></ul><p>Bye</p>",
    );
  });
});
