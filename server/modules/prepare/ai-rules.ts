// Principle 8: respect the employer's rules about AI. Postings or questions
// that restrict AI use route their free-text answers to the owner; text
// addressed to AI agents (visible or hidden) is flagged for the owner to see,
// never obeyed and never removed.
import { decodeEntities, htmlToText } from "@/shared/text";

/** A flag stored on `applications.flags`. */
export type ApplicationFlag = {
  kind: "ai_restriction" | "ai_directed_text";
  excerpt: string;
  /** Where it was found: the posting, or a question's field name. */
  where: string;
  /** For AI-directed text: whether it was hidden from human readers. */
  hidden?: boolean;
};

// Phrases that forbid or limit AI use when applying. Kept specific so a posting
// about building AI products doesn't match.
const RESTRICTION = [
  /\b(do not|don'?t|please don'?t|please do not|must not|should not|may not)\s+(use|rely on)\s+(any\s+)?(ai|a\.i\.|chatgpt|gpt|llms?|generative ai|ai tools?|artificial intelligence)\b/i,
  /\bwithout\s+(the\s+)?(use|help|assistance)\s+of\s+(ai|chatgpt|generative ai|ai tools?|artificial intelligence|llms?)\b/i,
  /\b(ai|chatgpt|llm)[- ](generated|written|assisted)\s+(responses?|answers?|applications?|content|submissions?)\s+(will|may)\s+(be\s+)?(disqualified|rejected|not be considered|removed)\b/i,
  /\b(no|not)\s+(ai|chatgpt|generative ai)[- ](generated|written|assisted)\b/i,
  /\b(answers?|responses?)\s+(must|should)\s+be\s+(written\s+)?(in your own words|by you|your own)\b/i,
  /\bin your own words\b[^.]{0,60}\b(not|without)\b[^.]{0,30}\b(ai|chatgpt)\b/i,
];

// Text that addresses an AI reader directly.
const AI_DIRECTED = [
  /\bif you(?:'re| are)\s+(an?\s+)?(ai|a\.i\.|llm|language model|bot|chatbot|automated|gpt|assistant|agent)\b/i,
  /\b(ai|llm|gpt|language model|automated)\s+(agents?|assistants?|tools?|systems?|models?)\s*(reading|processing|applying|filling)\b/i,
  /\bignore\s+(all\s+)?(previous|prior|above)\s+instructions\b/i,
  /\b(attention|note to|instructions? for)\s+(ai|llms?|chatgpt|language models?|bots?)\b/i,
  /\bas an ai\b/i,
];

const EXCERPT = 240;

function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, text.lastIndexOf(".", index) + 1, index - EXCERPT / 2);
  const end = Math.min(text.length, index + length + EXCERPT / 2);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) return excerptAround(text, m.index, m[0].length);
  }
  return null;
}

/** An excerpt of the AI restriction in `text`, or null when there is none. */
export function findAiRestriction(text: string | null | undefined): string | null {
  return text ? firstMatch(text, RESTRICTION) : null;
}

// Parts of the HTML a human reader doesn't see: comments and elements styled
// hidden, tiny or white.
const HIDDEN_STYLE = /(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*[0-2](\.\d+)?(px|pt)?\s*(;|"|')|opacity\s*:\s*0(\.0+)?\s*(;|"|')|color\s*:\s*(#fff(fff)?|white|rgba?\(\s*255\s*,\s*255\s*,\s*255))/i;

function hiddenParts(html: string): string[] {
  const parts: string[] = [];
  for (const m of html.matchAll(/<!--([\s\S]*?)-->/g)) parts.push(m[1]);
  for (const m of html.matchAll(/<(\w+)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const attrs = m[2];
    if (/\bhidden\b|aria-hidden\s*=\s*["']true/i.test(attrs) || (/style\s*=/i.test(attrs) && HIDDEN_STYLE.test(attrs))) {
      parts.push(m[3]);
    }
  }
  return parts.map((p) => htmlToText(p)).filter(Boolean);
}

/**
 * Text addressed to AI agents in a posting's HTML, visible or hidden (comments,
 * `display:none`, white or tiny text). Each match is reported once, hidden
 * ones first.
 */
export function findAiDirectedText(html: string | null | undefined): { excerpt: string; hidden: boolean }[] {
  if (!html) return [];
  const source = /&lt;\/?[a-z!]/i.test(html) ? decodeEntities(html) : html;
  const found: { excerpt: string; hidden: boolean }[] = [];
  for (const part of hiddenParts(source)) {
    const excerpt = firstMatch(part, AI_DIRECTED);
    if (excerpt) found.push({ excerpt, hidden: true });
  }
  const visible = firstMatch(htmlToText(source), AI_DIRECTED);
  if (visible && !found.some((f) => f.excerpt.includes(visible) || visible.includes(f.excerpt))) {
    found.push({ excerpt: visible, hidden: false });
  }
  return found;
}

/** Posting-level AI checks: a restriction anywhere in the posting, and any AI-directed text. */
export function postingFlags(descriptionHtml: string | null): ApplicationFlag[] {
  const flags: ApplicationFlag[] = [];
  const text = descriptionHtml ? htmlToText(descriptionHtml) : "";
  const restriction = findAiRestriction(text);
  if (restriction) flags.push({ kind: "ai_restriction", excerpt: restriction, where: "posting" });
  for (const d of findAiDirectedText(descriptionHtml)) {
    flags.push({ kind: "ai_directed_text", excerpt: d.excerpt, where: "posting", hidden: d.hidden });
  }
  return flags;
}
