import { describe, expect, it } from "vitest";
import { redactCodes } from "./apply-runs";

describe("redactCodes", () => {
  it("blanks a code on a line about a code, and leaves other lines alone", () => {
    const log = ["18:02:48 the form asks for a code sent to your email: aB3dE9fG", "18:02:49 fill question_69581820 (text) \"Ref\" = \"abc123de\" -> ok"].join("\n");
    expect(redactCodes(log)).toBe(["18:02:48 the form asks for a code sent to your email: [code]", "18:02:49 fill question_69581820 (text) \"Ref\" = \"abc123de\" -> ok"].join("\n"));
  });
});
