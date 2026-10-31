import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { getJobMatch } from "@/server/modules/matching/matching.service";

/**
 * A job's match: score against the threshold with fits and gaps, or why it wasn't scored.
 *
 * @param stacked - Fits above gaps, for a narrow column.
 * @param showThreshold - Show "threshold N" next to the score.
 */
export function MatchCard(props: { match: Awaited<ReturnType<typeof getJobMatch>>; stacked?: boolean; showThreshold?: boolean }) {
  const { match, stacked = false, showThreshold = true } = props;
  if (!match) {
    return <p className="text-sm text-muted-foreground">Not scored yet. Matching runs after each discovery run.</p>;
  }
  if (match.status === "filtered") {
    return <p className="text-sm text-muted-foreground">Ruled out before scoring: {match.filterReason}</p>;
  }
  if (match.status === "failed") {
    return <p className="text-sm text-destructive">Scoring failed: {match.error}</p>;
  }
  const good = (match.score ?? 0) >= match.threshold;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Match <Badge className={good ? "bg-success/15 text-success tabular-nums" : "tabular-nums"} variant={good ? "default" : "secondary"}>{match.score}</Badge>
          {showThreshold && <span className="text-sm font-normal text-muted-foreground">threshold {match.threshold}</span>}
        </CardTitle>
        {match.summary && <CardDescription>{match.summary}</CardDescription>}
      </CardHeader>
      <CardContent className={stacked ? "grid gap-4 text-sm" : "grid gap-4 text-sm sm:grid-cols-2"}>
        <div>
          <div className="mb-1 font-medium text-success">Fits</div>
          <ul className="list-disc pl-5 text-muted-foreground">{match.fits.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
        <div>
          <div className="mb-1 font-medium text-warning">Gaps</div>
          <ul className="list-disc pl-5 text-muted-foreground">{match.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </div>
      </CardContent>
    </Card>
  );
}
