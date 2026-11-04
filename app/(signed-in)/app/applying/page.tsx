import Link from "next/link";
import { Suspense } from "react";
import { ownerContext } from "@/server/auth/require-owner";
import { BOARD_STATUSES, countByStatus, listApplications, listUserMoves, runnerHandedBack, type ApplicationWithDetails } from "@/server/modules/applications/applications.service";
import { canRetry } from "@/server/modules/apply/apply.service";
import { matchEmail } from "@/server/modules/tracking/classify";
import { listUnmatchedEmails, listUnsortedEmails, type UnmatchedEmail } from "@/server/modules/tracking/tracking.service";
import { ago } from "@/shared/format";
import { InfoTip } from "../../_components/info-tip";
import { LiveRefresh } from "../../_components/live-refresh";
import { runnerFills, SiteBadge } from "../../_components/site-badge";
import { APPLY_STEP_TITLE, statusInfo } from "../../_components/status";
import { Board, type BoardCard, type BoardColumn, type CardNote } from "./board";
import { BoardSkeleton } from "../../_components/skeletons";

const COLUMNS: BoardColumn[] = [
  { key: "approved", label: "Approved", statuses: ["approved"], target: "approved", accent: "sky" },
  { key: "stuck", label: "Runner stuck", statuses: ["manual"], target: null, accent: "amber" },
  { key: "submitted", label: "Submitted", statuses: ["submitted", "confirmed"], target: "submitted", accent: "indigo" },
  { key: "responded", label: "Heard back", statuses: ["responded"], target: "responded", accent: "violet" },
  { key: "interviewing", label: "Interviewing", statuses: ["interviewing"], target: "interviewing", accent: "teal" },
  { key: "offer", label: "Offer", statuses: ["offer"], target: "offer", accent: "emerald" },
  { key: "closed", label: "Closed", statuses: ["rejected", "expired", "failed"], target: ["rejected", "expired"], accent: "zinc", muted: true },
];

/** A card's status pill: what the runner is doing, why it's stuck, or how long it has been in its lane. */
function cardNote(app: ApplicationWithDetails, now: Date, loose: UnmatchedEmail[]): CardNote {
  if (app.status === "manual") return { text: app.apply_note ?? "Handed back", detail: app.apply_note ?? undefined, tone: "warning" };
  if (app.status === "approved") {
    if (!runnerFills(app.job.source)) {
      return {
        text: "Site not supported yet",
        detail: "The apply runner can't fill this site yet, so it waits here. Or apply on the employer's site and move it to Submitted.",
        tone: "muted",
      };
    }
    if (app.apply_step === "waiting_for_you") return { text: APPLY_STEP_TITLE.waiting_for_you, tone: "warning" };
    if (app.apply_step) return { text: APPLY_STEP_TITLE[app.apply_step] ?? app.apply_step, tone: "info" };
    return { text: "Waiting for the runner", detail: "The apply runner on your computer picks it up within 20 seconds while it's running (pnpm worker:apply).", tone: "muted" };
  }
  // Email tracking confirms an application when the employer's receipt arrives; a day without one is worth a look.
  if (app.status === "submitted" && app.submitted_at && now.getTime() - new Date(app.submitted_at).getTime() > 86_400_000) {
    // An email naming the company that tracking couldn't tie to it for sure is probably the receipt.
    const tracked = { id: app.id, status: app.status, company: app.job.company_name, title: app.job.title, submittedAt: app.submitted_at };
    const email = loose.find((e) => matchEmail({ fromAddress: e.from, fromName: e.from, subject: e.subject, text: e.snippet, receivedAt: new Date(e.receivedAt) }, [tracked]).app);
    if (email) {
      return {
        text: "Email to check",
        detail: `"${email.subject}" arrived ${ago(email.receivedAt, now)} and names ${app.job.company_name}, but tracking couldn't sort it for sure. Link it on To do, Unmatched emails.`,
        tone: "info",
      };
    }
    return {
      text: "No confirmation yet",
      detail: `Submitted ${ago(app.submitted_at, now)} and no confirmation email has arrived. Check that it went through on the employer's site; some employers don't send one.`,
      tone: "warning",
    };
  }
  const tone = app.status === "offer" || app.status === "interviewing" ? "success" : "muted";
  return { text: ago(app.last_status_at, now), detail: `${statusInfo(app.status).label} since ${new Date(app.last_status_at).toLocaleDateString()}`, tone, since: true };
}

async function Applying() {
  const { db, owner } = await ownerContext();
  const [listed, moves, counts, unmatched] = await Promise.all([
    listApplications(db, owner.id, BOARD_STATUSES),
    listUserMoves(db),
    countByStatus(db, owner.id),
    listUnmatchedEmails(db, owner.id),
  ]);
  // Manual ones the runner never tried (preparing found the form can't be filled) are decided on To do.
  const apps = listed.filter((a) => a.status !== "manual" || runnerHandedBack(a));
  const now = new Date();
  const unsorted = await listUnsortedEmails(db, owner.id, apps.map((a) => ({ id: a.id, status: a.status, company: a.job.company_name, title: a.job.title, submittedAt: a.submitted_at })));
  const loose = [...unmatched, ...unsorted];
  // Most recent change first within each column; the runner takes approvals oldest first.
  apps.sort((a, b) => b.last_status_at.localeCompare(a.last_status_at));
  const cards: BoardCard[] = apps.map((a) => ({
    id: a.id,
    status: a.status,
    title: a.job.title,
    company: a.job.company_name,
    badge: <SiteBadge source={a.job.source} />,
    note: cardNote(a, now, loose),
    applyUrl: (a.status === "approved" && !runnerFills(a.job.source)) || a.status === "manual" ? (a.job.apply_url ?? a.job.url) : null,
    canRetry: a.status === "manual" && canRetry(a.job.source, a.apply_note),
  }));
  const review = (counts.queued ?? 0) + (counts.manual ?? 0) - apps.filter((a) => a.status === "manual").length;
  const answers = counts.needs_input ?? 0;
  return (
    <>
      {(review > 0 || answers > 0) && (
        <p className="text-sm text-muted-foreground">
          Before approval, on To do:{" "}
          {review > 0 && <Link href="/app/todo?tab=ready" className="font-medium text-foreground hover:underline">{review} to review</Link>}
          {review > 0 && answers > 0 && " · "}
          {answers > 0 && <Link href="/app/todo?tab=answers" className="font-medium text-foreground hover:underline">{answers} missing answers</Link>}
        </p>
      )}
      <Board columns={COLUMNS} cards={cards} moves={moves} />
    </>
  );
}

/** Applying: everything after approval as a board, from the apply runner's queue to offers. */
export default function ApplyingPage() {
  return (
    <main className="flex flex-col gap-4 md:h-full">
      <LiveRefresh />
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        Applying
        <InfoTip label="About the board">
          Approved applications on Greenhouse wait for the apply runner on your computer (<code>pnpm worker:apply</code>), which
          fills them one at a time. Anything it can&apos;t finish goes to Runner stuck with the reason; move it back to Approved to
          try again. Drag a card, or use its Move menu, when you apply yourself, hear back, get an interview, an offer or a no.
        </InfoTip>
      </h1>
      <Suspense fallback={<BoardSkeleton />}>
        <Applying />
      </Suspense>
    </main>
  );
}
