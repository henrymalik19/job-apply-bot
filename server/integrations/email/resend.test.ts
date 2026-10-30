import { describe, expect, it } from "vitest";
import { createResendSender } from "./resend";

const email = { from: "A <a@example.test>", to: "b@example.test", subject: "Hi", text: "t", html: "<p>t</p>", headers: { "X-Autopilot": "notify" } };

describe("createResendSender", () => {
  it("posts the email and returns Resend's id", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(createResendSender("key", fetchImpl)(email)).resolves.toBe("msg_1");
    expect(seen!.url).toBe("https://api.resend.com/emails");
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe("Bearer key");
    expect(JSON.parse(seen!.init.body as string)).toMatchObject({ to: ["b@example.test"], headers: { "X-Autopilot": "notify" } });
  });

  it("throws Resend's message on an error", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ message: "domain is not verified" }), { status: 403 })) as unknown as typeof fetch;
    await expect(createResendSender("key", fetchImpl)(email)).rejects.toThrow("Resend 403: domain is not verified");
  });
});
