// Deriving a form's answer from an answer-bank topic: fact topics read their
// value from confirmed facts, and every value is fitted to the question's field
// type and options by rule. Anything that doesn't fit cleanly returns null and
// the question goes to the owner.
import type { FormOption, FormQuestion } from "@/server/integrations/ats/forms";
import { resolvePlace } from "@/server/modules/criteria/places";
import { normalize } from "@/shared/text";

/** A topic's value: boolean, number, salary-style range, or text. */
export type TopicValue = boolean | number | { min: number; max: number } | string;

/** The minimal fact shape fact topics read. */
export type FactText = { category: string; fact: string };

/** The answer for one form field: display text plus the structured value the form takes. */
export type ShapedAnswer = { answer: string; value: string | string[] | boolean };

/** Normalizes a question's wording for the variants lookup ("Do you require sponsorship?" → "do you require sponsorship"). */
export function normalizeQuestion(label: string): string {
  return normalize(label);
}

const link = (facts: FactText[], label: RegExp): string | null => {
  for (const f of facts) {
    if (f.category !== "link" || !label.test(f.fact)) continue;
    const url = /https?:\/\/\S+/.exec(f.fact)?.[0];
    if (url) return url.replace(/[.,;)]+$/, "");
  }
  return null;
};

/**
 * The value of a fact topic, read from reviewed confirmed facts, or null when
 * no fact states it.
 *
 * @param key - A topic with `source = 'fact'`.
 */
export function factValue(key: string, facts: FactText[]): TopicValue | null {
  const text = (category: string) => facts.filter((f) => f.category === category).map((f) => f.fact).join("\n");
  switch (key) {
    case "work_authorization": {
      const t = text("authorization");
      if (/\b(not|isn'?t) authorized to work\b/i.test(t)) return false;
      return /\bauthorized to work\b/i.test(t) ? true : null;
    }
    case "requires_sponsorship": {
      const t = text("authorization");
      if (/\b(does not|doesn'?t|do not|will not|won'?t)\s+(now or in the future\s+)?require\b[^.]*\bsponsorship\b/i.test(t)) return false;
      return /\brequires?\b[^.]*\bsponsorship\b/i.test(t) ? true : null;
    }
    case "current_location":
      return /\bBased in ([^;.\n]+)/i.exec(text("logistics"))?.[1].trim() ?? null;
    case "linkedin_url":
      return link(facts, /linkedin/i);
    case "github_url":
      return link(facts, /github/i);
    case "website_url":
      return link(facts, /website|portfolio/i);
    default:
      return null;
  }
}

const yesNo = (b: boolean) => (b ? "Yes" : "No");

function optionStarting(options: FormOption[], word: "yes" | "no"): FormOption | undefined {
  const matches = options.filter((o) => normalize(o.label).split(" ")[0] === word);
  return matches.length === 1 ? matches[0] : undefined;
}

// "3-5 years", "$150,000 - $175,000", "10+", "Less than 2" → [lo, hi].
function optionRange(label: string): [number, number] | null {
  const nums = [...label.replace(/,/g, "").matchAll(/(\d+(?:\.\d+)?)\s*(k)?/gi)].map((m) => Number(m[1]) * (m[2] ? 1000 : 1));
  if (nums.length === 0) return null;
  if (/\+|or more|and above|over|more than/i.test(label)) return [nums[0], Infinity];
  if (/less than|under|fewer than|below/i.test(label)) return [-Infinity, nums[0]];
  return nums.length >= 2 ? [nums[0], nums[1]] : [nums[0], nums[0]];
}

function pickByNumber(options: FormOption[], n: number): FormOption | undefined {
  const hits = options.filter((o) => {
    const r = optionRange(o.label);
    return r !== null && n >= r[0] && n <= r[1];
  });
  return hits.length === 1 ? hits[0] : undefined;
}

function pickByText(options: FormOption[], text: string): FormOption | undefined {
  const want = normalize(text);
  const exact = options.filter((o) => normalize(o.label) === want);
  if (exact.length === 1) return exact[0];
  // A place answer ("Houston, TX") picks the one option naming the same state ("Texas").
  const states = resolvePlace(text).states;
  if (states.size === 1) {
    const [state] = states;
    const byState = options.filter((o) => {
      const s = resolvePlace(o.label).states;
      return s.size === 1 && s.has(state);
    });
    if (byState.length === 1) return byState[0];
  }
  return undefined;
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * Fits a topic value to one form question, or returns null when it doesn't fit
 * cleanly (no single matching option, or a file field).
 *
 * @param inverted - The wording asks the opposite of the topic (yes/no values flip).
 */
export function shapeAnswer(question: Pick<FormQuestion, "fieldType" | "options">, value: TopicValue, inverted = false): ShapedAnswer | null {
  const { fieldType, options } = question;
  if (fieldType === "file" || fieldType === "hidden") return null;
  const choose = (o: FormOption | undefined): ShapedAnswer | null =>
    o ? { answer: o.label, value: fieldType === "multiselect" ? [o.value] : o.value } : null;

  if (typeof value === "boolean") {
    const b = inverted ? !value : value;
    if (fieldType === "boolean") return { answer: yesNo(b), value: b };
    if (fieldType === "select" || fieldType === "multiselect") return choose(optionStarting(options, b ? "yes" : "no"));
    return { answer: yesNo(b), value: yesNo(b) };
  }
  if (inverted) return null;
  if (typeof value === "number") {
    if (fieldType === "select" || fieldType === "multiselect") return choose(pickByNumber(options, value));
    if (fieldType === "boolean") return null;
    return { answer: String(value), value: String(value) };
  }
  if (typeof value === "object") {
    if (fieldType === "select" || fieldType === "multiselect") return choose(pickByNumber(options, value.min));
    if (fieldType === "boolean") return null;
    const text = value.min === value.max ? money(value.min) : `${money(value.min)}–${money(value.max)}`;
    return { answer: text, value: text };
  }
  if (fieldType === "select" || fieldType === "multiselect") return choose(pickByText(options, value));
  if (fieldType === "boolean") return null;
  return { answer: value, value };
}

/** The "decline to answer" option of a voluntary EEO question, if it has exactly one. */
export function declineOption(question: Pick<FormQuestion, "fieldType" | "options">): ShapedAnswer | null {
  const declines = question.options.filter((o) => o.decline);
  if (declines.length !== 1) return null;
  const o = declines[0];
  return { answer: o.label, value: question.fieldType === "multiselect" ? [o.value] : o.value };
}
