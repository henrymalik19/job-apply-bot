import Link from "next/link";
import { Suspense } from "react";
import { ownerContext } from "@/server/auth/require-owner";
import { BOARD_STATUSES, countByStatus, listApplications, listUserMoves, runnerHandedBack, type ApplicationWithDetails } from "@/server/modules/applications/applications.service";
import { canRetry } from "@/server/modules/apply/apply.service";
import { ago } from "@/shared/format";
import { InfoTip } from "../../_components/info-tip";
import { runnerFills, SiteBadge } from "../../_components/site-badge";
import { APPLY_STEP_TITLE, statusInfo } from "../../_components/status";
import { Board, type BoardCard, type BoardColumn } from "./board";

const COLUMNS: BoardColumn[] = [
  { key: "approved", label: "Approved", statuses: ["approved"], target: "approved", accent: "sky" },
  { key: "stuck", label: "Runner stuck", statuses: ["manual"], target: null, accent: "amber" },
  { key: "submitted", label: "Submitted", statuses: ["submitted", "confirmed"], target: "submitted", accent: "indigo" },
  { key: "responded", label: "Heard back", statuses: ["responded"], target: "responded", accent: "violet" },
  { key: "interviewing", label: "Interviewing", statuses: ["interviewing"], target: "interviewing", accent: "teal" },
  { key: "offer", label: "Offer", statuses: ["offer"], target: "offer", accent: "emerald" },
  { key: "closed", label: "Closed", statuses: ["rejected", "expired", "failed"], target: ["rejected", "expired"], accent: "zinc", muted: true },
];

/** The line under a card's company: what the runner is doing, why it's stuck, or when it reached this status. */
function cardLine(app: ApplicationWithDetails, now: Date): string {
  if (app.status === "manual") return app.apply_note ?? "";
  if (app.status === "approved") {
    if (!runnerFills(app.job.source)) return "The runner can't fill this site yet; it waits here. Or apply on the employer's site and move it to Submitted";
    return app.apply_step ? (APPLY_STEP_TITLE[app.apply_step] ?? app.apply_step) : "Waiting for the apply runner";
  }
  return `${statusInfo(app.status).label} ${ago(app.last_status_at, now)}`;
}

async function Applying() {
  const { db, owner } = await ownerContext();
  const [listed, moves, counts] = await Promise.all([listApplications(db, owner.id, BOARD_STATUSES), listUserMoves(db), countByStatus(db, owner.id)]);
  // Manual ones the runner never tried (preparing found the form can't be filled) are decided on To do.
  const apps = listed.filter((a) => a.status !== "manual" || runnerHandedBack(a));
  const now = new Date();
  // Most recent change first within each column; the runner takes approvals oldest first.
  apps.sort((a, b) => b.last_status_at.localeCompare(a.last_status_at));
  const cards: BoardCard[] = apps.map((a) => ({
    id: a.id,
    status: a.status,
    title: a.job.title,
    company: a.job.company_name,
    badge: <SiteBadge source={a.job.source} />,
    line: cardLine(a, now),
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
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        Applying
        <InfoTip label="About the board">
          Approved applications on Greenhouse wait for the apply runner on your computer (<code>pnpm worker:apply</code>), which
          fills them one at a time. Anything it can&apos;t finish goes to Runner stuck with the reason; move it back to Approved to
          try again. Drag a card, or use its Move menu, when you apply yourself, hear back, get an interview, an offer or a no.
        </InfoTip>
      </h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Applying />
      </Suspense>
    </main>
  );
}
