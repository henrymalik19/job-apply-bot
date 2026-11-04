import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminContext } from "@/server/auth/require-owner";
import { getApplyRun } from "@/server/modules/apply/apply-runs";
import { parseRunLog } from "@/server/modules/apply/run-log";
import { ago } from "@/shared/format";
import { DetailSkeleton } from "../../../_components/skeletons";
import { TONE_BADGE } from "../../../_components/status";
import { RunSteps } from "../run-steps";
import { Screenshots } from "../screenshots";

type Params = Promise<{ id: string }>;

async function Run({ params }: { params: Params }) {
  const [{ admin }, { id }] = await Promise.all([adminContext(), params]);
  const run = await getApplyRun(admin, id);
  if (!run) notFound();
  const submitted = run.outcome === "submitted";
  const now = new Date();
  return (
    <>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={submitted ? TONE_BADGE.success : TONE_BADGE.warning}>{submitted ? "Submitted" : "Handed back"}</Badge>
          <span className="text-sm text-muted-foreground" title={new Date(run.startedAt).toLocaleString()}>{ago(run.startedAt, now)}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{run.application.title || "A job"}</h1>
        <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
          <span>{run.application.company}</span>
          <span>·</span>
          <Link href={`/admin/users/${run.user.id}`} className="hover:text-foreground hover:underline">{run.user.name}</Link>
          <span>·</span>
          <Link href={`/admin/applications/${run.application.id}`} className="hover:text-foreground hover:underline">The application</Link>
          <span>·</span>
          <Link href={`/admin/runs?application=${run.application.id}`} className="hover:text-foreground hover:underline">Its other runs</Link>
        </p>
        {!submitted && <p className="mt-1 text-sm">{run.outcome.replace(/^handed back: /, "")}</p>}
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Screenshots</CardTitle>
        </CardHeader>
        <CardContent>
          <Screenshots shots={run.shots} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Steps</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {run.log == null ? <p className="text-sm text-muted-foreground">The step log wasn&apos;t uploaded for this run.</p> : <RunSteps log={parseRunLog(run.log)} raw={run.log} />}
          {run.formUrl && (
            <a href={run.formUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground">
              <ExternalLink className="size-3" /> The form&apos;s HTML when the run ended
            </a>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** One apply run: how it ended, its screenshots and every step. */
export default function RunPage({ params }: { params: Params }) {
  return (
    <main className="flex flex-col gap-4">
      <Link href="/admin/runs" className={`${buttonVariants({ variant: "ghost", size: "sm" })} -mb-2 self-start`}>
        <ArrowLeft /> Runs
      </Link>
      <Suspense fallback={<DetailSkeleton />}>
        <Run params={params} />
      </Suspense>
    </main>
  );
}
