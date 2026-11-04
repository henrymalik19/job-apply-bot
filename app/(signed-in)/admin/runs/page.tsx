import { Suspense } from "react";
import { adminContext } from "@/server/auth/require-owner";
import { listApplyRuns, listRunFilters, type ApplyRunView } from "@/server/modules/apply/apply-runs";
import { TableSkeleton } from "../../_components/skeletons";
import { RunFiltersBar } from "./run-filters";
import { RunGroup } from "./runner-log";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

async function Runs({ searchParams }: { searchParams: SearchParams }) {
  // Everyone's runs: read with the admin client.
  const [{ admin }, params] = await Promise.all([adminContext(), searchParams]);
  const userId = one(params.user);
  const applicationId = one(params.application);
  const [filters, runs] = await Promise.all([
    listRunFilters(admin),
    listApplyRuns(admin, { userId: userId || undefined, applicationId: applicationId || undefined, limit: applicationId ? 10 : 30 }),
  ]);
  // One card per person and job, in order of their latest attempt.
  const groups = new Map<string, ApplyRunView[]>();
  for (const run of runs) groups.set(run.application.id, [...(groups.get(run.application.id) ?? []), run]);
  const now = new Date();
  return (
    <>
      <RunFiltersBar filters={filters} userId={userId} applicationId={applicationId} />
      {groups.size === 0 && (
        <p className="text-sm text-muted-foreground">No runs uploaded yet. They show here once the apply runner finishes one.</p>
      )}
      {[...groups.values()].map((group) => (
        <RunGroup key={group[0].application.id} runs={group} now={now} />
      ))}
    </>
  );
}

/** Runs: the apply runner's attempts by person and job, with step logs and screenshots, for debugging a fill. */
export default function RunsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Runs</h1>
        <p className="text-sm text-muted-foreground">
          What the apply runner did on each attempt, by person and job: every field it filled or couldn&apos;t, and screenshots of
          the form. Uploaded when each run ends.
        </p>
      </div>
      <Suspense fallback={<TableSkeleton rows={5} />}>
        <Runs searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
