import { describe, expect, it } from "vitest";
import { RailwayError, runCronNow } from "./railway";

type Sent = { headers: Record<string, string>; query: string; variables: Record<string, unknown> };

/** A fake Railway: answers by which operation the query names, and records what it was sent. */
function fakeRailway(opts: { cron?: string | null; started?: boolean; errors?: string[] } = {}) {
  const sent: Sent[] = [];
  const fetchFn = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    sent.push({ headers: init.headers as Record<string, string>, ...body });
    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    if (opts.errors) return json({ errors: opts.errors.map((message) => ({ message })) });
    if (body.query.includes("projectToken")) return json({ data: { projectToken: { projectId: "p1", environmentId: "e1" } } });
    if (body.query.includes("serviceInstances")) {
      return json({
        data: {
          environment: {
            serviceInstances: {
              edges: [
                { node: { id: "si-match", serviceName: "match", cronSchedule: opts.cron === undefined ? "*/15 * * * *" : opts.cron, nextCronRunAt: null } },
                { node: { id: "si-notify", serviceName: "notify", cronSchedule: "10-59/15 * * * *", nextCronRunAt: null } },
              ],
            },
          },
        },
      });
    }
    return json({ data: { deploymentInstanceExecutionCreate: opts.started ?? true } });
  }) as typeof fetch;
  return { sent, fetchFn };
}

describe("runCronNow", () => {
  it("starts the named service's instance with the project token", async () => {
    const { sent, fetchFn } = fakeRailway();
    await runCronNow("tok", "match", fetchFn);
    expect(sent).toHaveLength(3);
    expect(sent.every((s) => s.headers["Project-Access-Token"] === "tok")).toBe(true);
    expect(sent[1].variables).toEqual({ environmentId: "e1", projectId: "p1" });
    expect(sent[2].query).toContain("deploymentInstanceExecutionCreate");
    expect(sent[2].variables).toEqual({ input: { serviceInstanceId: "si-match" } });
  });

  it("refuses a service that isn't there or has no schedule", async () => {
    await expect(runCronNow("tok", "discover", fakeRailway().fetchFn)).rejects.toThrow("No Railway service named discover");
    await expect(runCronNow("tok", "match", fakeRailway({ cron: null }).fetchFn)).rejects.toThrow("has no cron schedule");
  });

  it("reports Railway's errors and a run it didn't start", async () => {
    await expect(runCronNow("tok", "match", fakeRailway({ errors: ["Not Authorized"] }).fetchFn)).rejects.toThrow(new RailwayError("Railway: Not Authorized"));
    await expect(runCronNow("tok", "match", fakeRailway({ started: false }).fetchFn)).rejects.toThrow("didn't start match");
  });
});
