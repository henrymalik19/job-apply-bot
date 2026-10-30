import { describe, expect, it } from "vitest";
import { buildDigest, inQuietHours, isDue, type NotifyItem } from "./digest";

describe("isDue", () => {
  it("is due in a notify status not yet notified", () => {
    expect(isDue("needs_input", null)).toBe(true);
    expect(isDue("manual", "needs_input")).toBe(true);
    expect(isDue("interviewing", "submitted")).toBe(true);
  });
  it("is not due when already notified in that status, or in other statuses", () => {
    expect(isDue("needs_input", "needs_input")).toBe(false);
    expect(isDue("submitted", null)).toBe(false);
  });
  it("sends ready-to-review only for fresh applications", () => {
    expect(isDue("queued", null)).toBe(true);
    expect(isDue("queued", "needs_input")).toBe(false);
  });
});

describe("inQuietHours", () => {
  const quiet = { start: "22:00", end: "07:00", timezone: "America/New_York" };
  it("wraps past midnight in the given time zone", () => {
    expect(inQuietHours(new Date("2026-10-30T03:00:00Z"), quiet)).toBe(true); // 23:00 EDT
    expect(inQuietHours(new Date("2026-10-30T10:30:00Z"), quiet)).toBe(true); // 06:30 EDT
    expect(inQuietHours(new Date("2026-10-30T11:00:00Z"), quiet)).toBe(false); // 07:00 EDT
    expect(inQuietHours(new Date("2026-10-30T16:00:00Z"), quiet)).toBe(false); // 12:00 EDT
  });
  it("handles a same-day window and treats equal start and end as off", () => {
    expect(inQuietHours(new Date("2026-10-30T17:00:00Z"), { ...quiet, start: "12:00", end: "14:00" })).toBe(true);
    expect(inQuietHours(new Date("2026-10-30T03:00:00Z"), { ...quiet, start: "00:00", end: "00:00" })).toBe(false);
  });
});

describe("buildDigest", () => {
  const item = (over: Partial<NotifyItem>): NotifyItem => ({
    id: "a1", status: "needs_input", title: "Staff Engineer", company: "Acme", score: 88, questions: [], flags: [], prepareError: null, ...over,
  });

  it("counts each group in the subject and links every application", () => {
    const { subject, text, html } = buildDigest(
      [
        item({ questions: ["Do you hold a clearance?"] }),
        item({ id: "a2", status: "manual", title: "Platform <Lead>", prepareError: "no public form" }),
        item({ id: "a3", status: "queued" }),
      ],
      "https://example.test/",
    );
    expect(subject).toBe("[Autopilot] 1 needs you, 1 to apply yourself, 1 ready to review");
    expect(text).toContain("https://example.test/app/applications/a1");
    expect(text).toContain("Question: Do you hold a clearance?");
    expect(text).toContain("no public form");
    expect(html).toContain("Platform &lt;Lead&gt;");
    expect(html).toContain('href="https://example.test/app/needs-you"');
  });
});
