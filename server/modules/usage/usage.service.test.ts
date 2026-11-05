import { describe, expect, it } from "vitest";
import { summarizeSpend } from "./usage.service";

describe("summarizeSpend", () => {
  it("splits a month's spend per application prepared and per job scored", () => {
    const s = summarizeSpend([
      { purpose: "score", job_id: "j1", cost_usd: 0.002 },
      { purpose: "score", job_id: "j2", cost_usd: 0.002 },
      { purpose: "score", job_id: "j3", cost_usd: 0.002 },
      { purpose: "classify", job_id: "j1", cost_usd: 0.01 },
      { purpose: "draft", job_id: "j1", cost_usd: 0.03 },
      { purpose: "tailor", job_id: "j1", cost_usd: 0.02 },
      { purpose: "classify", job_id: "j2", cost_usd: 0.01 },
      { purpose: "draft", job_id: "j2", cost_usd: 0.03 },
      { purpose: "map_fields", job_id: null, cost_usd: 0.004 },
      { purpose: "track_email", job_id: null, cost_usd: 0.001 },
    ]);
    expect(s.total).toBeCloseTo(0.111);
    expect(s.applications).toBe(2);
    expect(s.perApplication).toBeCloseTo(0.052);
    expect(s.scored).toBe(3);
    expect(s.perScore).toBeCloseTo(0.002);
    expect(s.allInPerApplication).toBeCloseTo(0.0555);
    expect(s.byPurpose[0]).toMatchObject({ purpose: "draft", label: "Drafting answers", calls: 2 });
  });

  it("has no per-application cost before any application is prepared", () => {
    const s = summarizeSpend([{ purpose: "score", job_id: "j1", cost_usd: 0.002 }]);
    expect(s.perApplication).toBeNull();
    expect(s.allInPerApplication).toBeNull();
  });
});
