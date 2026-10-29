import { describe, expect, it } from "vitest";
import { formatMinutes, shouldSkipBoard, sourceProblem, staleAfterMs, workerProblem, type SourceStatus, type WorkerRun } from "./run-health";

const now = new Date("2026-10-29T12:00:00Z");
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

const status = (s: Partial<SourceStatus> = {}): SourceStatus => ({
  worker: "discover",
  source: "greenhouse:acme",
  last_run_at: minsAgo(30),
  last_ok: true,
  last_error: null,
  last_counts: null,
  last_success_at: minsAgo(30),
  consecutive_failures: 0,
  first_run_at: minsAgo(600),
  ...s,
});

const workerRun = (m: number, ok: boolean | null): WorkerRun => ({
  started_at: minsAgo(m), finished_at: null, ok, counts: null, error: ok === false ? "boom" : null,
});

describe("sourceProblem", () => {
  it("is quiet after a recent success or before the first run", () => {
    expect(sourceProblem(status(), now)).toBeNull();
    expect(sourceProblem(undefined, now)).toBeNull();
  });

  it("flags two failures in a row", () => {
    expect(sourceProblem(status({ last_ok: false, consecutive_failures: 2 }), now)).toBe("failed 2 runs in a row");
  });

  it("flags no success after two missed runs plus slack", () => {
    // Every 4h: flagged after 8.5h, not before.
    expect(sourceProblem(status({ last_success_at: minsAgo(500) }), now, 240)).toBeNull();
    expect(sourceProblem(status({ last_success_at: minsAgo(520) }), now, 240)).toBe("no successful run in 8.5h");
    // Every 30m: flagged after 1.5h.
    expect(sourceProblem(status({ last_success_at: minsAgo(100) }), now, 30)).toBe("no successful run in 1.5h");
  });

  it("measures from the first run when it has never succeeded", () => {
    const never = { last_ok: false, last_success_at: null, consecutive_failures: 1 };
    expect(sourceProblem(status({ ...never, first_run_at: minsAgo(30) }), now)).toBeNull();
    expect(sourceProblem(status({ ...never, first_run_at: minsAgo(600) }), now)).toBe("no successful run in 8.5h");
  });
});

describe("shouldSkipBoard", () => {
  it("backs off after two failures until 2 hours pass", () => {
    expect(shouldSkipBoard(status({ consecutive_failures: 2, last_run_at: minsAgo(30) }), now)).toBe(true);
    expect(shouldSkipBoard(status({ consecutive_failures: 3, last_run_at: minsAgo(130) }), now)).toBe(false);
  });

  it("does not back off after one failure or for a new board", () => {
    expect(shouldSkipBoard(status({ consecutive_failures: 1 }), now)).toBe(false);
    expect(shouldSkipBoard(undefined, now)).toBe(false);
  });
});

describe("workerProblem", () => {
  it("reports a missing, stale or failed scheduler", () => {
    expect(workerProblem(null, now)).toBe("has never run");
    expect(workerProblem(workerRun(520, true), now)).toBe("hasn't run in 8.5h");
    expect(workerProblem(workerRun(250, true), now)).toBeNull();
    expect(workerProblem(workerRun(10, false), now)).toBe("last run failed: boom");
    expect(workerProblem(workerRun(10, true), now)).toBeNull();
  });
});

describe("staleAfterMs / formatMinutes", () => {
  it("allows two missed runs plus 30 minutes", () => {
    expect(staleAfterMs(240)).toBe(510 * 60_000);
    expect(formatMinutes(510)).toBe("8.5h");
    expect(formatMinutes(240)).toBe("4h");
    expect(formatMinutes(30)).toBe("30m");
  });
});
