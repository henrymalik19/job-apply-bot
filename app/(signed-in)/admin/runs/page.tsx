import Link from "next/link";
import { Suspense } from "react";
import { ownerContext } from "@/server/auth/require-owner";
import { listApplyRuns } from "@/server/modules/apply/apply-runs";
import { TableSkeleton } from "../../_components/skeletons";
import { RunnerLog } from "./runner-log";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function Runs({ searchParams }: { searchParams: SearchParams }) {
  const [{ db }, params] = await Promise.all([ownerContext(), searchParams]);
  const applicationId = typeof params.application === "string" ? params.application : undefined;
  const runs = await listApplyRuns(db, { applicationId, limit: applicationId ? 10 : 20 });
  return (
    <>
      {applicationId && (
        <p className="text-sm text-muted-foreground">
          {runs[0] ? `${runs[0].application.title} at ${runs[0].application.company}. ` : "One application's runs. "}
          <Link href="/admin/runs" className="font-medium text-foreground hover:underline">Show all runs</Link>
        </p>
      )}
      <RunnerLog runs={runs} now={new Date()} showJob={!applicationId} />
    </>
  );
}

/** Runs: the apply runner's attempts, newest first, with step logs and screenshots, for debugging a fill. */
export default function RunsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Runs</h1>
      <Suspense fallback={<TableSkeleton rows={5} />}>
        <Runs searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
