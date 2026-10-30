import type { SendEmail } from "./smtp";

const ENDPOINT = "https://api.resend.com/emails";

/**
 * A sender over Resend's HTTPS API, for hosts that block outbound SMTP (Railway
 * Hobby). The `from` domain must be verified in Resend. Errors carry Resend's
 * message; the key never appears in them.
 */
export function createResendSender(apiKey: string, fetchImpl: typeof fetch = fetch): SendEmail {
  return async (email) => {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: email.from, to: [email.to], subject: email.subject, text: email.text, html: email.html, headers: email.headers }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) throw new Error(`Resend ${res.status}: ${body.message ?? "no message id"}`);
    return body.id;
  };
}
