import { Suspense } from "react";
import { ownerContext } from "@/server/auth/require-owner";
import { BOARD_STATUSES, listApplications, listUserMoves, type ApplicationWithDetails } from "@/server/modules/applications/applications.service";
import { ago } from "@/shared/format";
import { InfoTip } from "../../_components/info-tip";
import { runnerFills, SiteBadge } from "../../_components/site-badge";
import { APPLY_STEP_TITLE, statusInfo } from "../../_components/status";
import { Board, type BoardCard, type BoardColumn } from "./board";

const COLUMNS: BoardColumn[] = [
  { key: "approved", label: "Approved", statuses: ["approved"], target: null },
  { key: "submitted", label: "Submitted", statuses: ["submitted", "confirmed"], target: "submitted" },
  { key: "responded", label: "Heard back", statuses: ["responded"], target: "responded" },
  { key: "interviewing", label: "Interviewing", statuses: ["interviewing"], target: "interviewing" },
  { key: "offer", label: "Offer", statuses: ["offer"], target: "offer" },
  { key: "closed", label: "Closed", statuses: ["rejected", "expired", "failed"], target: "rejected", muted: true },
];

/** The line under a card's company: what the runner is doing, or when it reached this status. */
function cardLine(app: ApplicationWithDetails, now: Date): string {
  if (app.status === "approved") {
    if (!runnerFills(app.job.source)) return "Apply on the employer's site, then move it to Submitted";
    return app.apply_step ? (APPLY_STEP_TITLE[app.apply_step] ?? app.apply_step) : "Waiting for the apply runner";
  }
  return `${statusInfo(app.status).label} ${ago(app.last_status_at, now)}`;
}

async function Applying() {
  const { db, owner } = await ownerContext();
  const [apps, moves] = await Promise.all([listApplications(db, owner.id, BOARD_STATUSES), listUserMoves(db)]);
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
    applyUrl: a.status === "approved" && !runnerFills(a.job.source) ? (a.job.apply_url ?? a.job.url) : null,
  }));
  return <Board columns={COLUMNS} cards={cards} moves={moves} />;
}

/** Applying: everything after approval as a board, from the apply runner's queue to offers. */
export default function ApplyingPage() {
  return (
    <main className="flex flex-col gap-4 md:h-full">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        Applying
        <InfoTip label="About the board">
          Approved applications on Greenhouse wait for the apply runner on your computer (<code>pnpm worker:apply</code>), which
          fills them one at a time. Drag a card, or use its Move menu, when you apply yourself, hear back, get an interview, an
          offer or a no. Anything the runner hands back goes to To do.
        </InfoTip>
      </h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Applying />
      </Suspense>
    </main>
  );
}
