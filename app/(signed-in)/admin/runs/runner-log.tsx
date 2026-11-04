import { ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApplyRunView } from "@/server/modules/apply/apply-runs";
import { ago } from "@/shared/format";
import { cn } from "@/shared/cn";
import { Screenshots } from "./screenshots";

/** A step-log line worth spotting: a field it couldn't fill, an error the form showed, a failure. */
const PROBLEM = /NOT FILLED|threw:|form shows|failed:|handed back|error:/i;
// Script errors and blocked ad requests on the employer's page: noise when reading why a field wasn't filled.
const NOISE = /^\S+ (console\.(error|warning)|request failed|HTTP 4\d\d|page error)/;

/**
 * The apply runner's attempts, newest first: how each ended, its step log (problems
 * highlighted, page noise hidden) and screenshots.
 *
 * @param showJob - Name each run's job (off when listing one application's runs).
 */
export function RunnerLog({ runs, now, showJob = true }: { runs: ApplyRunView[]; now: Date; showJob?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Latest attempts</CardTitle>
        <CardDescription>
          What the apply runner did on each attempt: every field it filled or couldn&apos;t, and screenshots of the form. Uploaded
          when each run ends.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {runs.length === 0 && (
          <p className="text-sm text-muted-foreground">No runs uploaded yet. They show here once the apply runner finishes one.</p>
        )}
        {runs.map((run, i) => {
          const lines = (run.log ?? "").split("\n").filter((l) => l.trim() && !NOISE.test(l));
          const problems = lines.filter((l) => PROBLEM.test(l)).length;
          const submitted = run.outcome === "submitted";
          return (
            <details key={run.id} open={i === 0} className="group rounded-lg border">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" />
                <span className={cn("shrink-0 font-medium", submitted ? "text-success" : "text-warning")}>{submitted ? "Submitted" : "Handed back"}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground" title={run.outcome}>
                  {showJob && <span className="text-foreground">{run.application.title} at {run.application.company}</span>}
                  {showJob && !submitted && " · "}
                  {submitted ? "" : run.outcome.replace(/^handed back: /, "")}
                </span>
                {problems > 0 && <span className="shrink-0 text-xs text-warning">{problems} to look at</span>}
                <span className="shrink-0 text-xs text-muted-foreground" title={new Date(run.startedAt).toLocaleString()}>{ago(run.startedAt, now)}</span>
              </summary>
              <div className="flex flex-col gap-3 border-t px-3 py-3">
                {showJob && (
                  <Link href={`/app/applications/${run.application.id}`} className="self-start text-xs text-muted-foreground hover:text-foreground hover:underline">
                    Open the application
                  </Link>
                )}
                {run.log == null ? (
                  <p className="text-sm text-muted-foreground">The step log wasn&apos;t uploaded for this run.</p>
                ) : (
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 text-xs leading-relaxed">
                    {lines.map((line, n) => (
                      <div key={n} className={PROBLEM.test(line) ? "text-warning" : undefined}>{line}</div>
                    ))}
                  </pre>
                )}
                {run.shots.length > 0 && <Screenshots shots={run.shots} />}
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
