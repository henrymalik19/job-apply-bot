import { ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApplyRunView } from "@/server/modules/apply/apply-runs";
import { parseRunLog } from "@/server/modules/apply/run-log";
import { ago } from "@/shared/format";
import { cn } from "@/shared/cn";
import { RunSteps } from "./run-steps";
import { Screenshots } from "./screenshots";

/**
 * One person's attempts at one job, newest first: how each ended, its screenshots in
 * fixed slots, and its step log as a checklist.
 */
export function RunGroup({ runs, now }: { runs: ApplyRunView[]; now: Date }) {
  const { user, application } = runs[0];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline gap-x-2">
          <span>{application.title || "A job"}</span>
          <span className="text-sm font-normal text-muted-foreground">at {application.company || "?"}</span>
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-2">
          <Link href={`/admin/users/${user.id}`} className="font-medium text-foreground hover:underline">{user.name}</Link>
          <span>· {runs.length} {runs.length === 1 ? "attempt" : "attempts"}</span>
          <Link href={`/admin/applications/${application.id}`} className="hover:text-foreground hover:underline">
            · Open the application
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {runs.map((run, i) => {
          const log = run.log == null ? null : parseRunLog(run.log);
          const problems = log ? log.counts.not_filled + log.counts.error : 0;
          const submitted = run.outcome === "submitted";
          return (
            <details key={run.id} open={i === 0} className="group rounded-lg border">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" />
                <span className={cn("shrink-0 font-medium", submitted ? "text-success" : "text-warning")}>{submitted ? "Submitted" : "Handed back"}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground" title={run.outcome}>
                  {submitted ? "" : run.outcome.replace(/^handed back: /, "")}
                </span>
                {problems > 0 && <span className="shrink-0 text-xs text-warning">{problems} couldn&apos;t fill</span>}
                <span className="shrink-0 text-xs text-muted-foreground" title={new Date(run.startedAt).toLocaleString()}>{ago(run.startedAt, now)}</span>
              </summary>
              <div className="flex flex-col gap-4 border-t px-3 py-3">
                <Screenshots shots={run.shots} />
                {log == null ? (
                  <p className="text-sm text-muted-foreground">The step log wasn&apos;t uploaded for this run.</p>
                ) : (
                  <RunSteps log={log} raw={run.log ?? ""} />
                )}
                {run.formUrl && (
                  <a href={run.formUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground">
                    <ExternalLink className="size-3" /> The form&apos;s HTML when the run ended
                  </a>
                )}
              </div>
            </details>
          );
        })}
      </CardContent>
    </Card>
  );
}
