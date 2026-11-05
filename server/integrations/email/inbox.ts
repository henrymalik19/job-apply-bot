// The job inbox over IMAP (Purelymail by default): reading recent mail, and
// moving one message to a folder. Used by the apply runner (emailed security
// codes) and the track_email stage. Nothing is ever deleted.
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

/** Where your application mail arrives; the password comes from the environment. */
export type InboxConfig = { host: string; port: number; user: string; password: string };

/** One email, as the trackers need it. `text` is the plain-text body (or the HTML's text). */
export type InboxMail = {
  messageId: string;
  receivedAt: Date;
  fromAddress: string;
  fromName: string;
  subject: string;
  text: string;
  /** Headers by lower-case name (the digest marks its own mail). */
  headers: Record<string, string>;
};

/** Runs `fn` with a connected client, logging out afterwards. */
export async function withInbox<T>(config: InboxConfig, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.password },
    logger: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/**
 * Reads INBOX mail received since `since` (IMAP's SINCE is by day; the time is checked here),
 * optionally only from senders matching `from`, oldest first, at most `limit` (the newest).
 */
export async function readInbox(config: InboxConfig, since: Date, opts: { from?: string; limit?: number } = {}): Promise<InboxMail[]> {
  return withInbox(config, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ since, ...(opts.from ? { from: opts.from } : {}) }, { uid: true });
      if (!uids || uids.length === 0) return [];
      const messages = await client.fetchAll(uids.slice(-(opts.limit ?? 500)), { source: true, internalDate: true }, { uid: true });
      const mails: InboxMail[] = [];
      for (const msg of messages) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const receivedAt = msg.internalDate ? new Date(msg.internalDate) : (parsed.date ?? new Date(0));
        if (receivedAt < since) continue;
        const from = parsed.from?.value[0];
        const headers: Record<string, string> = {};
        for (const [k, v] of parsed.headers) headers[k.toLowerCase()] = typeof v === "string" ? v : JSON.stringify(v);
        mails.push({
          // A message without an id (rare) gets one from its time and subject, so it's still read once.
          messageId: parsed.messageId ?? `${receivedAt.toISOString()}:${parsed.subject ?? ""}`,
          receivedAt,
          fromAddress: from?.address ?? "",
          fromName: from?.name ?? "",
          subject: parsed.subject ?? "",
          text: parsed.text ?? (typeof parsed.html === "string" ? parsed.html.replace(/<[^>]+>/g, " ") : ""),
          headers,
        });
      }
      return mails;
    } finally {
      lock.release();
    }
  });
}

/**
 * Marks one email read (by its Message-ID): one that needs nothing from you, like an application receipt.
 *
 * @returns Whether it was found.
 */
export async function markRead(config: InboxConfig, messageId: string): Promise<boolean> {
  return withInbox(config, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ header: { "message-id": messageId } }, { uid: true });
      if (!uids || uids.length === 0) return false;
      return client.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
  });
}

/**
 * Moves one INBOX message (by Message-ID) to `folder`, creating the folder if needed. A nested folder is
 * written with "/" ("Jobrx/Received") and created with the server's own separator.
 *
 * @returns Whether the message was found and moved.
 */
export async function moveToFolder(config: InboxConfig, messageId: string, folder: string): Promise<boolean> {
  return withInbox(config, async (client) => {
    const path = await ensureFolder(client, folder);
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ header: { "message-id": messageId } }, { uid: true });
      if (!uids || uids.length === 0) return false;
      return (await client.messageMove(uids, path, { uid: true })) !== false;
    } finally {
      lock.release();
    }
  });
}

/** Creates a folder (and its parents) if it isn't there; returns its path in the server's own separator. */
async function ensureFolder(client: ImapFlow, folder: string): Promise<string> {
  const folders = await client.list();
  const delimiter = folders.find((f) => f.path === "INBOX")?.delimiter || folders[0]?.delimiter || "/";
  const parts = folder.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const path = parts.slice(0, i).join(delimiter);
    if (!folders.some((f) => f.path === path)) await client.mailboxCreate(path);
  }
  return parts.join(delimiter);
}

/**
 * Moves everything in an old folder into `folder` (created if needed) and removes the old one; nothing
 * happens when the old folder isn't there.
 *
 * @returns How many messages moved.
 */
export async function mergeFolder(config: InboxConfig, from: string, folder: string): Promise<number> {
  return withInbox(config, async (client) => {
    if (!(await client.list()).some((f) => f.path === from)) return 0;
    const path = await ensureFolder(client, folder);
    const lock = await client.getMailboxLock(from);
    let moved = 0;
    try {
      const uids = (await client.search({ all: true }, { uid: true })) || [];
      if (uids.length) {
        await client.messageMove(uids, path, { uid: true });
        moved = uids.length;
      }
    } finally {
      lock.release();
    }
    await client.mailboxDelete(from);
    return moved;
  });
}
