import { describe, expect, it, vi } from "vitest";
import { fetchJson, HttpError } from "./http";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("fetchJson", () => {
  it("retries 5xx and network errors with exponential backoff", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(json({ ok: true }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(fetchJson("https://example.test/x", { fetchFn, sleep })).resolves.toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it("does not retry a 404", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("nope", { status: 404 }));
    const err = (await fetchJson("https://example.test/x", { fetchFn, sleep: async () => {} }).catch((e) => e)) as HttpError;
    expect(err).toBeInstanceOf(HttpError);
    expect(err.message).toBe("HTTP 404 from example.test");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the last attempt", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));
    await expect(fetchJson("https://example.test/x", { fetchFn, sleep: async () => {} })).rejects.toThrow(/429/);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});
