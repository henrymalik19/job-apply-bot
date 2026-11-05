import type { Db } from "@/server/db/types";
import { countByStatus } from "@/server/modules/applications/applications.service";
import { getRecentJobs, type JobListItem } from "@/server/modules/jobs/jobs.service";
import { getMatchSummary } from "@/server/modules/matching/matching.service";
import { latestDiscoveryRun } from "@/server/modules/runs/runs.service";
import type { WorkerRun } from "@/server/modules/runs/runs.service";

/** One labeled number on the overview, with what it means and where it leads. */
export type Tile = { label: string; value: number; hint: string; href?: string; status?: string };

/** Everything the overview page shows. */
export type Overview = {
  /** Open jobs, new in 24h and 7 days, matched and scored under the current criteria. */
  jobs: Tile[];
  /** Applications waiting on the user: needs you, runner stuck, ready to review. */
  waiting: Tile[];
  /** Applications on their way: approved through offer. */
  progress: Tile[];
  /** Last finished discovery run, if any. */
  lastRun: WorkerRun | null;
  /** Newest open jobs. */
  recent: JobListItem[];
};

/** Loads a user's overview: job numbers, their application funnel, the last discovery run and the newest jobs. */
export async function getOverview(db: Db, userId: string, now: Date): Promise<Overview> {
  const [byStatus, lastRun, recent, matching] = await Promise.all([
    countByStatus(db, userId),
    latestDiscoveryRun(db),
    getRecentJobs(db, 8),
    getMatchSummary(db, userId, now),
  ]);
  return {
    jobs: [
      { label: "Your open jobs", value: matching.yours, hint: "Open postings from the job boards that pass your search filters.", href: "/app/jobs" },
      { label: "New in 24h", value: matching.today, hint: "Of your open jobs, the ones discovery first saw in the last 24 hours." },
      { label: "New in 7 days", value: matching.week, hint: "Of your open jobs, the ones discovery first saw in the last 7 days." },
      {
        label: `Matched (${matching.threshold}+)`,
        value: matching.aboveThreshold,
        hint: `Open jobs Claude scored ${matching.threshold} or higher against your profile. Prepare turns the best of these into applications, up to your daily cap.`,
        href: "/app/jobs?match=matched",
      },
      { label: "Scored", value: matching.scored, hint: "Open jobs Claude has scored against your profile and criteria, at any score." },
    ],
    waiting: [
      { status: "needs_input", label: "Needs you", value: byStatus.needs_input, hint: "Prepared, but a required question needs your answer. Once answered it moves to Ready to review.", href: "/app/todo?tab=answers" },
      { status: "manual", label: "Can't fill automatically", value: byStatus.manual, hint: "Forms preparing or the apply runner couldn't fill. Approve them to wait for the runner, retry them, or apply on the employer's site.", href: "/app/applying" },
      { status: "queued", label: "Ready to review", value: byStatus.queued, hint: "Every required question is answered. Check it, then approve or skip.", href: "/app/todo?tab=ready" },
    ],
    progress: [
      { status: "approved", label: "Approved", value: byStatus.approved, hint: "You approved it; waiting to be submitted." },
      { status: "submitted", label: "Submitted", value: byStatus.submitted, hint: "Sent to the employer." },
      { status: "confirmed", label: "Confirmed", value: byStatus.confirmed, hint: "The employer confirmed they received it." },
      { status: "responded", label: "Responded", value: byStatus.responded, hint: "The employer replied, not yet an interview." },
      { status: "interviewing", label: "Interviewing", value: byStatus.interviewing, hint: "An interview is in progress." },
      { status: "offer", label: "Offer", value: byStatus.offer, hint: "You received an offer." },
    ],
    lastRun,
    recent,
  };
}
