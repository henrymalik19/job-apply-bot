import { describe, expect, it } from "vitest";
import { resumeOutdated } from "./resumes.service";

const profile = { employment: [{ id: "hub" }, { id: "kin" }] } as never;
const resume = (ids: string[], updated_at = "2026-11-05T10:00:00Z") => ({ content: { experience: ids.map((employment_id) => ({ employment_id })) }, updated_at });

describe("resumeOutdated", () => {
  it("is current when every job on it is still in your profile and nothing changed since", () => {
    expect(resumeOutdated(resume(["hub", "kin"]), profile, null)).toBe(false);
    expect(resumeOutdated(resume(["hub"]), profile, "2026-11-05T09:00:00Z")).toBe(false);
  });
  it("is out of date when it lists a job you removed", () => {
    expect(resumeOutdated(resume(["hub", "second-nature"]), profile, null)).toBe(true);
  });
  it("is out of date when your profile changed after it was made", () => {
    expect(resumeOutdated(resume(["hub"]), profile, "2026-11-05T11:00:00Z")).toBe(true);
  });
});
