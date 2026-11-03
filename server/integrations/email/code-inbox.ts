// Reads the security code an application form emails you (Greenhouse asks for
// one when its bot check doesn't pass) from your own inbox over IMAP, so the
// apply runner can enter it. Only Greenhouse mail that arrived after the form
// asked is read, and nothing is kept.
import { readInbox, type InboxConfig } from "./inbox";

export type { InboxConfig } from "./inbox";

/** One email the code can come from. */
export type CodeMail = { subject: string; text: string; received: Date };

// A code: 6 to 10 letters and digits with at least one of each ("aB3dE9fG"), so a word or a job number isn't taken.
const CODE = /\b(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{6,10}\b/;
// A line that is nothing but a code (with a digit, so a sign-off like "Pinterest" isn't taken).
const CODE_LINE = /^\s*((?=[A-Za-z0-9]*\d)[A-Za-z0-9]{6,10})\s*$/m;

/**
 * Pulls the code out of a security-code email: the first code-like word after
 * the word "code", or a line holding only a code.
 */
export function extractSecurityCode(text: string): string | null {
  const flat = text.replace(/\s+/g, " ");
  for (const m of flat.matchAll(/code/gi)) {
    const after = flat.slice(m.index + m[0].length, m.index + 200);
    const found = after.match(CODE);
    if (found) return found[0];
  }
  return text.match(CODE_LINE)?.[1] ?? null;
}

/**
 * Picks the code from the newest matching email: Greenhouse's security-code mail
 * received after `since`, preferring one that names the company.
 */
export function pickCode(mails: CodeMail[], since: Date, company: string): string | null {
  const fresh = mails
    .filter((m) => m.received >= since && /security code|verification code|code/i.test(m.subject))
    .sort((a, b) => b.received.getTime() - a.received.getTime());
  const named = fresh.filter((m) => `${m.subject} ${m.text}`.toLowerCase().includes(company.toLowerCase()));
  for (const m of [...named, ...fresh]) {
    const code = extractSecurityCode(m.text);
    if (code) return code;
  }
  return null;
}

/**
 * A reader for the code: waits for it to arrive, checking every few seconds.
 *
 * @returns The code, or null when none arrived within `timeoutMs`.
 */
export function codeInbox(config: InboxConfig, log: (line: string) => void = () => {}) {
  async function recentMail(since: Date): Promise<CodeMail[]> {
    const mails = await readInbox(config, since, { from: "greenhouse", limit: 10 });
    return mails.map((m) => ({ subject: m.subject, text: m.text, received: m.receivedAt }));
  }

  return {
    async waitForCode(since: Date, company: string, timeoutMs = 120_000, pollMs = 5000): Promise<string | null> {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          const code = pickCode(await recentMail(since), since, company);
          if (code) return code;
        } catch (err) {
          log(`reading the inbox failed: ${(err as Error).message}`);
        }
        await new Promise((r) => setTimeout(r, pollMs));
      }
      return null;
    },
  };
}
