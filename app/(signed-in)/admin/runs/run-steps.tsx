import { Check, ChevronRight, CircleAlert, Minus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { shownValue, type FillLine, type RunLog } from "@/server/modules/apply/run-log";
import { cn } from "@/shared/cn";
import { TONE_BADGE } from "../../_components/status";

/** "+6.2s" from the run's start. */
const since = (at: number) => (at >= 60 ? `+${Math.floor(at / 60)}m${String(Math.round(at % 60)).padStart(2, "0")}s` : `+${at.toFixed(1)}s`);

const ICON = {
  ok: <Check className="size-4 text-success" />,
  not_filled: <CircleAlert className="size-4 text-warning" />,
  error: <X className="size-4 text-destructive" />,
  absent: <Minus className="size-4 text-muted-foreground" />,
};

/** One field: did it fill, the question as the form words it, and the value; field id and kind on hover. */
function FillRow({ fill }: { fill: FillLine }) {
  return (
    <li className="flex items-start gap-2 py-1.5" title={`${fill.field} (${fill.kind})`}>
      <span className="mt-0.5 shrink-0">{ICON[fill.result]}</span>
      <div className="grid min-w-0 flex-1 gap-x-4 sm:grid-cols-2">
        <span className={cn("min-w-0", fill.result === "absent" && "text-muted-foreground")}>{fill.label}</span>
        <span className="min-w-0 break-words text-muted-foreground">{shownValue(fill.value)}</span>
        {fill.detail && <span className="text-xs text-warning sm:col-span-2">{fill.detail}</span>}
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{since(fill.at)}</span>
    </li>
  );
}

/** A collapsible group of fields. */
function Group({ title, fills, open = false }: { title: string; fills: FillLine[]; open?: boolean }) {
  if (fills.length === 0) return null;
  return (
    <details open={open} className="group/fills">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 transition-transform group-open/fills:rotate-90" />
        {title} ({fills.length})
      </summary>
      <ul className="divide-y pl-5 text-sm">
        {fills.map((f, i) => <FillRow key={`${f.field}-${i}`} fill={f} />)}
      </ul>
    </details>
  );
}

/**
 * A run's step log as a checklist: counts, the fields it couldn't fill first, what
 * happened along the way, every field filled, those the form didn't have, and the raw
 * log for the exact text.
 */
export function RunSteps({ log, raw }: { log: RunLog; raw: string }) {
  const problems = log.fills.filter((f) => f.result === "not_filled" || f.result === "error");
  const { counts } = log;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge className={TONE_BADGE.success}>{counts.ok} filled</Badge>
        {counts.not_filled > 0 && <Badge className={TONE_BADGE.warning}>{counts.not_filled} couldn&apos;t fill</Badge>}
        {counts.error > 0 && <Badge className={TONE_BADGE.destructive}>{counts.error} errors</Badge>}
        {counts.absent > 0 && (
          <Badge className={TONE_BADGE.muted} title="Fields tried on every form that this one doesn't have (like Race, or Education years). Not a problem.">
            {counts.absent} not on this form
          </Badge>
        )}
        {log.noise > 0 && (
          <span className="text-muted-foreground" title="The employer's page's own script errors and blocked requests: in the raw log.">
            {log.noise} page messages hidden
          </span>
        )}
      </div>

      {problems.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-1">
          <ul className="divide-y text-sm">
            {problems.map((f, i) => <FillRow key={`${f.field}-${i}`} fill={f} />)}
          </ul>
        </div>
      )}

      {log.notes.length > 0 && (
        <ol className="flex flex-col gap-1 text-sm">
          {log.notes.map((n, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-14 shrink-0 text-xs tabular-nums text-muted-foreground">{since(n.at)}</span>
              <span className={cn("min-w-0 break-words", n.problem ? "text-warning" : "text-muted-foreground")}>{n.text}</span>
            </li>
          ))}
        </ol>
      )}

      <Group title="Filled" fills={log.fills.filter((f) => f.result === "ok")} />
      <Group title="Not on this form" fills={log.fills.filter((f) => f.result === "absent")} />

      <details className="group/raw">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 transition-transform group-open/raw:rotate-90" />
          Raw log
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 text-xs leading-relaxed">{raw}</pre>
      </details>
    </div>
  );
}
