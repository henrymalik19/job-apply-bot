// Reads Lever's application form (jobs.lever.co/<company>/<id>/apply) into questions. Lever has no
// form API: the page is server-rendered HTML, so the standard fields are read from their fixed names,
// each custom-question card from the JSON Lever embeds in it (its "baseTemplate": every field's type,
// wording, options and whether it's required), and any self-identification dropdowns (eeo[...]).
import { parse, type HTMLElement } from "node-html-parser";
import { z } from "zod";
import { DECLINE, type ApplicationForm, type FieldType, type FormQuestion } from "./forms";

/** Lever's standard fields, in form order, with how each is asked and filled. */
const STANDARD: { name: string; label: string; fieldType: FieldType }[] = [
  { name: "resume", label: "Resume/CV", fieldType: "file" },
  { name: "name", label: "Full name", fieldType: "text" },
  { name: "email", label: "Email", fieldType: "text" },
  { name: "phone", label: "Phone", fieldType: "text" },
  { name: "location", label: "Current location", fieldType: "location" },
  { name: "org", label: "Current company", fieldType: "text" },
  { name: "urls[LinkedIn]", label: "LinkedIn URL", fieldType: "text" },
  { name: "urls[GitHub]", label: "GitHub URL", fieldType: "text" },
  { name: "urls[Portfolio]", label: "Portfolio URL", fieldType: "text" },
  { name: "urls[Twitter]", label: "Twitter URL", fieldType: "text" },
  { name: "urls[Other]", label: "Other website", fieldType: "text" },
  { name: "comments", label: "Additional information", fieldType: "textarea" },
];

/** A card's embedded description of its questions. */
const card = z.object({
  id: z.string(),
  fields: z.array(
    z.object({
      type: z.string(),
      text: z.string(),
      description: z.string().nullish(),
      required: z.boolean().nullish(),
      options: z.array(z.object({ text: z.string() })).nullish(),
    }),
  ),
});

const CARD_TYPES: Record<string, FieldType> = {
  text: "text",
  textarea: "textarea",
  dropdown: "select",
  "multiple-choice": "select",
  "multiple-select": "multiselect",
  "file-upload": "file",
};

const required = (el: HTMLElement | null) => el?.hasAttribute("required") ?? false;

/**
 * Parses Lever's apply page into its form.
 *
 * @param html - The apply page (jobs.lever.co/<company>/<id>/apply).
 * @param descriptionHtml - The posting's text, from Lever's postings API.
 * @returns The form, or null when the page has no application form (a closed posting).
 */
export function parseLeverForm(html: string, descriptionHtml: string | null): ApplicationForm | null {
  const root = parse(html);
  const form = root.querySelector("form#application-form") ?? root.querySelector("form");
  if (!form || !form.querySelector('[name="email"]')) return null;
  const questions: FormQuestion[] = [];

  for (const s of STANDARD) {
    const el = form.querySelector(`[name="${s.name}"]`);
    if (!el) continue;
    questions.push({ fieldName: s.name, label: s.label, description: null, required: required(el), fieldType: s.fieldType, options: [], group: "application" });
  }

  for (const input of form.querySelectorAll('input[name$="[baseTemplate]"]')) {
    const parsed = card.safeParse((() => {
      try {
        return JSON.parse(input.getAttribute("value") ?? "");
      } catch {
        return null;
      }
    })());
    if (!parsed.success) continue;
    // A card's fields are named after its own hidden input: cards[<id>][field0] for questions,
    // surveysResponses[<id>][responses][field0] for a voluntary survey (self-identification).
    const prefix = (input.getAttribute("name") ?? "").replace(/\[baseTemplate\]$/, "");
    const survey = prefix.startsWith("surveysResponses[");
    parsed.data.fields.forEach((f, i) => {
      questions.push({
        fieldName: survey ? `${prefix}[responses][field${i}]` : `${prefix}[field${i}]`,
        label: f.text.trim(),
        description: f.description?.trim() || null,
        required: survey ? false : (f.required ?? false),
        fieldType: CARD_TYPES[f.type] ?? "text",
        options: (f.options ?? []).map((o) => ({ label: o.text, value: o.text, decline: DECLINE.test(o.text) })),
        group: survey ? "eeo" : "application",
      });
    });
  }

  // Voluntary self-identification, when the company asks: dropdowns named eeo[gender], eeo[race], …
  for (const select of form.querySelectorAll('select[name^="eeo["]')) {
    const name = select.getAttribute("name")!;
    const label = select.closest("li, .application-question, label")?.querySelector(".application-label, .text, label")?.text.trim() || name.slice(4, -1);
    questions.push({
      fieldName: name,
      label: label.replace(/\s*✱\s*$/, ""),
      description: null,
      required: false,
      fieldType: "select",
      options: select
        .querySelectorAll("option")
        .filter((o) => (o.getAttribute("value") ?? "") !== "")
        .map((o) => ({ label: o.text.trim(), value: o.getAttribute("value")!, decline: DECLINE.test(o.text) })),
      group: "eeo",
    });
  }

  return { questions, descriptionHtml };
}

/** A Lever posting's text as HTML: its description, each list (requirements, …) and closing notes. */
export const leverPosting = z.object({
  description: z.string().nullish(),
  lists: z.array(z.object({ text: z.string(), content: z.string() })).nullish(),
  additional: z.string().nullish(),
});

/** Joins a posting's parts into one HTML block, for AI rules and the prompt. */
export function leverDescriptionHtml(posting: z.infer<typeof leverPosting>): string {
  const lists = (posting.lists ?? []).map((l) => `<h3>${l.text}</h3><ul>${l.content}</ul>`).join("");
  return `${posting.description ?? ""}${lists}${posting.additional ?? ""}`;
}
