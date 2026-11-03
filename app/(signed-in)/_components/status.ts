/** How an application status reads in the UI: a label, one line on what it means, and a color tone. */
export type StatusInfo = { label: string; hint: string; tone: Tone };

/** Color tones: warning = waiting on you, info = in progress, success = good news, muted = done/out. */
export type Tone = "warning" | "info" | "success" | "muted" | "destructive";

export const STATUS: Record<string, StatusInfo> = {
  needs_input: {
    label: "Needs you",
    hint: "Prepared, but a required question needs your answer. Answer it and the application moves to Ready to review.",
    tone: "warning",
  },
  manual: {
    label: "Runner stuck",
    hint: "The form couldn't be filled automatically; the reason is on it. Send it back to the apply runner, or apply on the employer's site and mark it submitted.",
    tone: "warning",
  },
  queued: {
    label: "Ready to review",
    hint: "Every required question is answered. Check the answers and resume, then approve or skip.",
    tone: "info",
  },
  approved: { label: "Approved", hint: "You approved it. It's waiting to be submitted.", tone: "info" },
  submitted: { label: "Submitted", hint: "Sent to the employer.", tone: "info" },
  confirmed: { label: "Confirmed", hint: "The employer confirmed they received it.", tone: "info" },
  responded: { label: "Responded", hint: "The employer replied (not yet an interview).", tone: "success" },
  interviewing: { label: "Interviewing", hint: "You have an interview in progress.", tone: "success" },
  offer: { label: "Offer", hint: "You received an offer.", tone: "success" },
  skipped: { label: "Skipped", hint: "You skipped this job.", tone: "muted" },
  expired: { label: "Expired", hint: "It waited too long and was closed.", tone: "muted" },
  rejected: { label: "Rejected", hint: "The employer declined.", tone: "muted" },
  failed: { label: "Preparing failed", hint: "Something went wrong while preparing it.", tone: "destructive" },
};

/** Status info, falling back to the raw status. */
export const statusInfo = (status: string): StatusInfo => STATUS[status] ?? { label: status.replace("_", " "), hint: "", tone: "muted" };

/** Badge classes per tone (soft background, colored text). */
export const TONE_BADGE: Record<Tone, string> = {
  warning: "bg-warning/15 text-warning",
  info: "bg-info/15 text-info",
  success: "bg-success/15 text-success",
  muted: "bg-muted text-muted-foreground",
  destructive: "bg-destructive/15 text-destructive",
};

/** Headline while the apply runner works on an approved application. */
export const APPLY_STEP_TITLE: Record<string, string> = {
  filling: "Filling the form now",
  waiting_for_you: "Filled: click Submit in Chrome",
  submitting: "Submitting",
};

/** Where an application of this status is listed, for back links and redirects: a To do lane, or the board. */
export function todoHref(status: string): string {
  if (status === "manual") return "/app/applying";
  const tab = ({ queued: "ready", needs_input: "answers" } as Record<string, string>)[status];
  return tab ? `/app/todo?tab=${tab}` : "/app/todo";
}
