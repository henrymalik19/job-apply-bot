import { createTransport } from "nodemailer";

/** One email to send. */
export type OutgoingEmail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Extra headers, e.g. the marker inbox readers use to skip our own mail. */
  headers?: Record<string, string>;
};

/** Sends one email and returns the server's message id. */
export type SendEmail = (email: OutgoingEmail) => Promise<string>;

/** SMTP login. Port 465 uses TLS from the start; any other port upgrades with STARTTLS. */
export type SmtpConfig = { host: string; port: number; user: string; password: string };

/**
 * An SMTP sender (Purelymail: smtp.purelymail.com:465, the mailbox address as
 * the user). Errors from the server propagate; the password never appears in them.
 */
export function createSmtpSender(config: SmtpConfig): SendEmail {
  const transport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return async (email) => {
    const info = await transport.sendMail(email);
    return info.messageId;
  };
}
