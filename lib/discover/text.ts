// Text helpers for job postings: HTML → plain markdown-ish text, and the
// normalization behind jobs.dedup_key.

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: String.fromCharCode(160), ndash: "–", mdash: "—",
  hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NAMED[code.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): string {
  // Greenhouse escapes its HTML (&lt;p&gt;), so decode once before reading tags.
  const source = /&lt;\/?[a-z]/i.test(html) ? decodeEntities(html) : html;
  const text = source
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<h[1-6][^>]*>/gi, "\n## ")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/(p|div|ul|ol|section|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return tidyText(decodeEntities(text));
}

// Collapses runs of spaces (including non-breaking ones) and blank lines.
export function tidyText(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[\p{Zs}\t]+/gu, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function dedupKey(company: string, title: string, location: string | null): string {
  return [normalize(company), normalize(title), normalize(location)].join("|");
}
