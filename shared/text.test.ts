import { describe, expect, it } from "vitest";
import { decodeEntities, dedupKey, htmlToText, normalize } from "./text";

describe("htmlToText", () => {
  it("turns headings, paragraphs and list items into plain markdown", () => {
    expect(htmlToText("<h3>Role</h3><p>Do <b>things</b>.</p><ul><li>One</li><li>Two</li></ul>")).toBe(
      "## Role\n\nDo things.\n\n- One\n- Two",
    );
  });

  it("decodes entity-escaped HTML (Greenhouse) before stripping tags", () => {
    expect(htmlToText("&lt;p&gt;Fish &amp;amp; chips&lt;/p&gt;")).toBe("Fish & chips");
  });

  it("drops scripts and styles", () => {
    expect(htmlToText("<style>p{}</style><p>Hi</p><script>alert(1)</script>")).toBe("Hi");
  });
});

describe("decodeEntities", () => {
  it("handles named, decimal and hex entities and leaves unknown ones", () => {
    expect(decodeEntities("&lt;a&gt; &#39;x&#x27; &nbsp;&bogus;")).toBe("<a> 'x'  &bogus;");
  });
});

describe("dedupKey", () => {
  it("ignores case, punctuation and accents", () => {
    expect(dedupKey("Acme, Inc.", "Sr. Engineer (Platform)", "São Paulo")).toBe(
      dedupKey("ACME INC", "sr engineer platform", "Sao Paulo"),
    );
  });

  it("keeps different locations apart", () => {
    expect(dedupKey("Acme", "Engineer", "NYC")).not.toBe(dedupKey("Acme", "Engineer", "SF"));
  });

  it("treats a missing location as empty", () => {
    expect(dedupKey("Acme", "Engineer", null)).toBe("acme|engineer|");
    expect(normalize(undefined)).toBe("");
  });
});
