import { describe, expect, it } from "vitest";
import { parseApplyLimit } from "./apply-limits";

describe("parseApplyLimit", () => {
  it("reads how many and over how long", () => {
    expect(parseApplyLimit("we are limiting applications to a total of 2 jobs over a span of 60 days.")).toEqual({ count: 2, days: 60 });
    expect(parseApplyLimit("You may apply to up to three roles every 6 months.")).toEqual({ count: 3, days: 180 });
    expect(parseApplyLimit("Candidates can submit 1 application per year.")).toEqual({ count: 1, days: 365 });
    expect(parseApplyLimit("no more than 5 applications within 30 days")).toEqual({ count: 5, days: 30 });
  });

  it("is null when the message doesn't say both", () => {
    expect(parseApplyLimit("You have reached the application limit.")).toBeNull();
    expect(parseApplyLimit("We have 2 jobs open right now.")).toBeNull();
  });
});
