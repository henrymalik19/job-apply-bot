// Pulling the security code out of an emailed message, and picking the right
// email. The wording follows Greenhouse's security-code mail; real ones are
// checked against the run record the first time the runner reads one.
import { describe, expect, it } from "vitest";
import { extractSecurityCode, pickCode, type CodeMail } from "./code-inbox";

describe("extractSecurityCode", () => {
  it("takes the code after the word code", () => {
    expect(extractSecurityCode("Copy and paste this code into the security code field on your application: aB3dE9fG")).toBe("aB3dE9fG");
  });

  it("takes a code on its own line", () => {
    expect(extractSecurityCode("Hi Malik,\n\nYour application needs one more step.\n\n  Xk72pQaZ  \n\nThanks")).toBe("Xk72pQaZ");
  });

  it("skips words without a digit after code", () => {
    expect(extractSecurityCode("Enter the security code shown below in the application:\nQ8wErT5y")).toBe("Q8wErT5y");
  });

  it("finds nothing in a mail without a code", () => {
    expect(extractSecurityCode("Thank you for applying to Pinterest. We'll be in touch.\n\nPinterest\n")).toBeNull();
  });
});

describe("pickCode", () => {
  const since = new Date("2026-11-03T18:06:00Z");
  const mail = (subject: string, text: string, at: string): CodeMail => ({ subject, text, received: new Date(at) });

  it("uses the newest fresh code mail, preferring the company's", () => {
    const mails = [
      mail("Security code for your application to Pinterest", "security code: Old11111", "2026-11-03T18:00:00Z"),
      mail("Security code for your application to Acme", "security code: Acme2222", "2026-11-03T18:06:30Z"),
      mail("Security code for your application to Pinterest", "security code: New33333", "2026-11-03T18:06:20Z"),
    ];
    expect(pickCode(mails, since, "Pinterest")).toBe("New33333");
  });

  it("ignores mail from before the form asked", () => {
    expect(pickCode([mail("Security code", "security code: Old11111", "2026-11-03T18:00:00Z")], since, "Pinterest")).toBeNull();
  });
});
