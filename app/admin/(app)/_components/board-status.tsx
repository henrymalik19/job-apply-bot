import { Badge } from "@/components/ui/badge";
import type { BoardHealth } from "@/server/modules/runs/runs.service";
import { ago } from "@/shared/format";

/**
 * Badge for a board's state: paused, not checked yet, or the last run's
 * result with how long ago it ran.
 */
export function BoardStatus({ board, now }: { board: BoardHealth; now: Date }) {
  if (!board.active) return <Badge variant="outline">Paused</Badge>;
  if (!board.status) return <Badge variant="secondary">Not checked yet</Badge>;
  return (
    <Badge variant={board.problem || !board.status.last_ok ? "destructive" : "secondary"}>
      {board.status.last_ok ? "OK" : "Failed"} · {ago(board.status.last_run_at, now)}
    </Badge>
  );
}

/** One-line summary of a run's counts, e.g. "190 listed · 4 duplicates". */
export function RunCounts({ counts }: { counts: Record<string, number> | null | undefined }) {
  if (!counts) return <span className="text-muted-foreground">—</span>;
  const parts = (
    [
      ["fetched", "listed"],
      ["filtered", "filtered out"],
      ["inserted", "new"],
      ["duplicates", "duplicates"],
      ["closed", "closed"],
    ] as const
  )
    .filter(([k]) => counts[k])
    .map(([k, label]) => `${counts[k].toLocaleString()} ${label}`);
  return <span className="text-muted-foreground">{parts.join(" · ") || "no changes"}</span>;
}
