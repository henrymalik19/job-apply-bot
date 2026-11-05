// Sorting job-inbox email by rules, and matching it to an application. The
// wording follows common Greenhouse, Lever and Ashby mail.
import { describe, expect, it } from "vitest";
import { classifyByRules, companyKey, matchEmail, type TrackedApp } from "./classify";

const mail = (subject: string, text: string, fromAddress = "no-reply@us.greenhouse-mail.io", fromName = "") => ({ subject, text, fromAddress, fromName });

describe("classifyByRules", () => {
  it("sorts the common ATS mails", () => {
    expect(classifyByRules(mail("Thank you for applying to LaunchDarkly", "We have received your application for Backend Software Engineer."))).toBe("confirmation");
    // Pinterest's receipt says neither "applying" nor "received".
    expect(classifyByRules(mail("Your application for Sr Software Engineer at Pinterest", "Hi Malik, Thank you for your interest in joining the Pinterest team! We appreciate the time you took to apply."))).toBe("confirmation");
    // The same opening on a rejection is still a rejection.
    expect(classifyByRules(mail("Your application to Pinterest", "Thank you for your interest in joining the Pinterest team. Unfortunately, we have decided to move forward with other candidates."))).toBe("rejection");
    expect(classifyByRules(mail("Your application to Pinterest", "Thank you for applying. Unfortunately, we have decided to move forward with other candidates."))).toBe("rejection");
    expect(classifyByRules(mail("Next steps", "We'd love to schedule a 30 minute phone screen. Please share your availability here: calendly.com/acme"))).toBe("interview");
    expect(classifyByRules(mail("Security code for your application to Pinterest", "Copy and paste this code: aB3dE9fG"))).toBe("code");
    expect(classifyByRules(mail("30+ new jobs for you", "Senior Engineer at ...", "jobalerts-noreply@linkedin.com"))).toBe("job_alert");
    // A job board's pitch from a subdomain that reads like an invite is still an alert.
    expect(classifyByRules(mail("Netflix is hiring: apply now", "Apply today and schedule your interview with Netflix.", "donotreply@match.indeed.com"))).toBe("job_alert");
    expect(classifyByRules(mail("Schedule your interview", "Can we set up a call this week?", "recruiting@netflix.com"))).toBe("interview");
  });

  it("reads a receipt that says what happens if you're not selected as a receipt, not a rejection", () => {
    // Rula's (via Ashby) receipt, which the rules once took for a rejection.
    const rula = mail(
      "Thanks for applying to Rula!",
      "Thanks for applying to our Sr. Software Engineer role! We're thrilled you're interested in joining Rula and appreciate the time you took to submit your application. We aim to review and respond to applications within about one business week. If you're not selected to move forward, please know this doesn't necessarily reflect your experience, sometimes we have to make difficult decisions among many qualified candidates. If selected to move forward, our interview process typically takes around four weeks.",
    );
    expect(classifyByRules(rula)).toBe("confirmation");
    expect(classifyByRules(mail("Application received", "Thank you for applying. Unfortunately, due to the volume of applications we can't reply to every applicant individually."))).toBe("confirmation");
    expect(classifyByRules(mail("Thanks for applying", "We have received your application. Should we decide not to move forward with your application, we'll let you know by email."))).toBe("confirmation");
  });

  it("still reads a decision as a rejection, however it's worded", () => {
    for (const text of [
      "After careful consideration, we've decided not to move forward.",
      "We will not be moving forward with your application at this time.",
      "Unfortunately, the position has been filled.",
      "We regret to inform you that you were not chosen.",
      "Your application has not been selected for further consideration.",
    ]) expect(classifyByRules(mail("Your application", text)), text).toBe("rejection");
  });

  it("leaves what it can't tell to Claude", () => {
    expect(classifyByRules(mail("Quick question about your background", "Hi Malik, are you open to relocating to Denver?", "jane@acme.com"))).toBeNull();
  });
});

describe("matchEmail", () => {
  const app = (id: string, company: string, title: string, submittedAt = "2026-11-01T00:00:00Z"): TrackedApp => ({ id, status: "submitted", company, title, submittedAt });
  const at = new Date("2026-11-03T12:00:00Z");

  it("finds the application by the company named in the email", () => {
    const apps = [app("ld", "LaunchDarkly", "Backend Software Engineer, SDK"), app("pin", "Pinterest", "Sr Software Engineer, EPD Ads")];
    expect(matchEmail({ ...mail("Thank you for applying to LaunchDarkly", "..."), receivedAt: at }, apps)).toMatchObject({ app: { id: "ld" }, confidence: 0.9 });
    // The sender's domain names it too.
    expect(matchEmail({ ...mail("Your application", "Thanks!", "recruiting@pinterest.com"), receivedAt: at }, apps).app?.id).toBe("pin");
  });

  it("tells several applications at one company apart by title, or leaves it to you", () => {
    const apps = [app("a", "Acme, Inc.", "Backend Engineer"), app("b", "Acme, Inc.", "Product Designer")];
    expect(matchEmail({ ...mail("Acme: Product Designer", "Thanks for applying to the Product Designer role."), receivedAt: at }, apps)).toMatchObject({ app: { id: "b" }, confidence: 0.85 });
    expect(matchEmail({ ...mail("Thanks for applying to Acme", "We got it."), receivedAt: at }, apps).confidence).toBe(0.5);
  });

  it("ignores applications sent after the email and companies it doesn't name", () => {
    expect(matchEmail({ ...mail("Thanks for applying to Acme", "..."), receivedAt: at }, [app("a", "Acme", "Engineer", "2026-11-05T00:00:00Z")]).app).toBeNull();
    expect(matchEmail({ ...mail("Hello", "Nothing here"), receivedAt: at }, [app("a", "Acme", "Engineer")]).app).toBeNull();
  });

  it("reads company names without their suffix", () => {
    expect(companyKey("Scale AI, Inc.")).toBe("scale ai");
    expect(companyKey("Acme Technologies LLC")).toBe("acme");
  });
});
