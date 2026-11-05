import { describe, expect, it } from "vitest";
import { failedFields, parseRunLog, shownValue } from "./run-log";

const LOG = [
  "18:02:48.243 0959d7e8-1f60-498f-b2a9-ca24d7590e27: filling Senior Software Engineer at Coinbase",
  "18:02:50.709 open https://job-boards.greenhouse.io/embed/job_app?for=coinbase&token=8248766",
  "18:02:51.347 page: https://job-boards.greenhouse.io/embed/job_app?for=coinbase&token=8248766",
  "18:02:51.434 page: https://job-boards.greenhouse.io/embed/job_app?for=coinbase&token=8248766",
  "18:02:51.832 console.error: Fetch API cannot load https://ad.doubleclick.net/ccm/s/collect",
  "18:02:52.077 HTTP 401 GET https://my.greenhouse.io/users/self?job_post_id=8248766",
  "18:02:53.768 open -> ok",
  '18:02:55.507 fill race (decline) "Race" = (decline) -> NOT FILLED',
  '18:02:55.600 fill school--0 (closest) "School" = "Western Governors University" -> ok',
  '18:03:06.977 fill question_1 (text) "Why us?" = "Because" -> NOT FILLED',
  "  form shows: This field is required",
  '18:03:07.000 fill question_2 (select) "Sponsorship?" = ["No"] -> not on this form',
  '18:03:07.100 fill resume (resume) "Resume/CV" = Malik Henry Resume.pdf -> threw: Timeout 5000ms exceeded.',
  "18:03:20.000 outcome: handed back: The Chrome tab was closed before submitting.",
].join("\n");

describe("parseRunLog", () => {
  const log = parseRunLog(LOG);

  it("reads each fill with its result, and an older miss on an optional extra as not on the form", () => {
    expect(log.fills.map((f) => [f.field, f.result])).toEqual([
      ["race", "absent"],
      ["school--0", "ok"],
      ["question_1", "not_filled"],
      ["question_2", "absent"],
      ["resume", "error"],
    ]);
    expect(log.counts).toEqual({ ok: 1, not_filled: 1, absent: 2, error: 1 });
    expect(log.fills[2]).toMatchObject({ label: "Why us?", detail: "This field is required", at: 18.7 });
    expect(log.fills[4].detail).toBe("Timeout 5000ms exceeded.");
  });

  it("turns the rest into a few readable notes and counts the page's own noise", () => {
    expect(log.notes.map((n) => n.text)).toEqual([
      "Started: Senior Software Engineer at Coinbase",
      "Opening https://job-boards.greenhouse.io/embed/job_app?for=coinbase&token=8248766",
      "The form opened",
      "Ended: handed back, The Chrome tab was closed before submitting.",
    ]);
    expect(log.noise).toBe(2);
  });
});

describe("shownValue", () => {
  it("shows logged values the way a person reads them", () => {
    expect(shownValue('["United States"]')).toBe("United States");
    expect(shownValue('"Atlanta, Georgia"')).toBe("Atlanta, Georgia");
    expect(shownValue("true")).toBe("Ticked");
    expect(shownValue("(decline)")).toBe("Declined to answer");
    expect(shownValue("Malik Henry Resume.pdf")).toBe("Malik Henry Resume.pdf");
  });
});

describe("failedFields", () => {
  it("lists each field that didn't take its first value, and whether a retry did", () => {
    const { fills } = parseRunLog(
      [
        `02:16:19.544 fill _systemfield_location (text) "Location" = "Atlanta, GA" -> NOT FILLED`,
        `02:16:24.000 fill _systemfield_location (text) "Location (filled by AI)" = "United States" -> ok`,
        `02:16:30.000 fill school (closest) "School" = "Georgia State University" -> NOT FILLED`,
        `02:16:31.000 fill name (text) "Name" = "Malik Henry" -> ok`,
      ].join("\n"),
    );
    expect(failedFields(fills)).toEqual([
      { field: "_systemfield_location", kind: "text", label: "Location", value: `"Atlanta, GA"`, recovered: true },
      { field: "school", kind: "closest", label: "School", value: `"Georgia State University"`, recovered: false },
    ]);
  });
});
