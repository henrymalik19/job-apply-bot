import { Suspense } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ownerContext } from "@/server/auth/require-owner";
import { loadMatchingHealth } from "@/server/modules/matching/matching.service";
import { formatMinutes, loadDiscoveryHealth, loadWorkerHealth, type WorkerHealth } from "@/server/modules/runs/runs.service";
import { ago } from "@/shared/format";
import { paginate, parsePage } from "@/shared/paginate";
import { BoardStatus, RunCounts } from "../../_components/board-status";
import { Pager, scrollingTable } from "../../_components/data-table";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const n = (v: number | undefined) => (v ?? 0).toLocaleString();

/** What a worker's last run did, in a few words. */
function runSummary(w: WorkerHealth): string {
  const c = (w.lastRun?.counts ?? {}) as Record<string, number>;
  if (!w.lastRun) return "";
  if (!w.lastRun.ok) return w.lastRun.error ?? "unknown error";
  switch (w.name) {
    case "discover":
      return `${n(c.ok)} boards OK · ${n(c.failed)} failed · ${n(c.skipped)} backing off · ${n(c.inserted)} new jobs`;
    case "match":
      return c.candidates ? `${n(c.scored)} scored · ${n(c.filtered)} ruled out · ${n(c.failed)} failed${c.deferred ? ` · ${n(c.deferred)} deferred` : ""}` : "nothing new to score";
    case "prepare":
      return c.candidates
        ? `${n(c.queued)} ready · ${n(c.needs_input)} need you · ${n(c.manual)} apply yourself${c.deferred ? ` · ${n(c.deferred)} over the daily cap` : ""}`
        : "nothing to prepare";
    case "notify":
      if (c.sent) return `emailed ${n(c.applications)} applications`;
      if (c.held_quiet) return `${n(c.due)} waiting for quiet hours to end`;
      if (c.held_interval) return `${n(c.due)} waiting for the 15-minute gap`;
      return "nothing new to send";
    default:
      return "";
  }
}

async function Health({ searchParams }: { searchParams: SearchParams }) {
  const { db, owner } = await ownerContext();
  const now = new Date();
  const [{ boards }, workers, matching, params] = await Promise.all([
    loadDiscoveryHealth(db, owner.id, now),
    loadWorkerHealth(db, owner.id, now),
    loadMatchingHealth(db, owner.id, now),
    searchParams,
  ]);
  const active = boards.filter((b) => b.active && b.board_token && b.ats !== "other");
  const problems = [
    ...workers.filter((w) => w.problem).map((w) => `The ${w.name} worker ${w.problem}.`),
    ...(matching.capReached ? [`Monthly LLM spend cap (${matching.spend.cap}) reached; scoring is paused until next month.`] : []),
    ...active.filter((b) => b.problem).map((b) => `${b.name} (${b.ats}:${b.board_token}) ${b.problem}.`),
  ];
  // Problem boards first, then by name.
  const rows = [...active].sort((a, b) => Number(!!b.problem) - Number(!!a.problem) || a.name.localeCompare(b.name));
  const page = paginate(rows, parsePage(params.page));

  return (
    <>
      {problems.length > 0 && (
        <Alert variant="destructive" className="shrink-0">
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card className="shrink-0">
        <CardHeader>
          <CardTitle>Workers</CardTitle>
          <CardDescription>
            Each runs on its own Railway schedule (UTC) and is flagged after two missed runs. Claude spend this month: $
            {matching.spend.spent.toFixed(2)} of ${matching.spend.cap.toFixed(2)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>Every</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>What it did</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workers.map((w) => (
                <TableRow key={w.name}>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{w.name}</div>
                    <div className="text-xs text-muted-foreground">{w.does}</div>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatMinutes(w.intervalMinutes)}</TableCell>
                  <TableCell>
                    {w.lastRun ? (
                      <Badge variant={w.problem ? "destructive" : "secondary"}>
                        {w.lastRun.ok ? "OK" : "Failed"} · {ago(w.lastRun.started_at, now)}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Not run yet</Badge>
                    )}
                    {w.problem && w.lastRun?.ok !== false && <div className="mt-1 text-xs text-destructive">{w.problem}</div>}
                  </TableCell>
                  <TableCell className={w.lastRun?.ok === false ? "whitespace-normal text-destructive" : "whitespace-normal text-muted-foreground"}>
                    {runSummary(w) || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className={scrollingTable.card}>
        <CardHeader>
          <CardTitle>Boards</CardTitle>
          <CardDescription>{active.length.toLocaleString()} active boards, problems first.</CardDescription>
        </CardHeader>
        <CardContent className={scrollingTable.content}>
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active boards. Add companies on the Companies page.</p>
          ) : (
            <>
            <Table containerClassName={scrollingTable.container}>
              <TableHeader className={scrollingTable.header}>
                <TableRow>
                  <TableHead>Board</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Last success</TableHead>
                  <TableHead>Last result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="font-medium">{b.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{b.ats}:{b.board_token}</div>
                    </TableCell>
                    <TableCell>
                      <BoardStatus board={b} now={now} />
                      {b.problem && <div className="mt-1 text-xs text-destructive">{b.problem}</div>}
                    </TableCell>
                    <TableCell>{ago(b.status?.last_success_at, now)}</TableCell>
                    <TableCell className="whitespace-normal">
                      {b.status?.last_ok === false ? (
                        <span className="text-destructive">{b.status.last_error}</span>
                      ) : (
                        <RunCounts counts={b.status?.last_counts} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={page} basePath="/admin/health" />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** Health: each worker's schedule and last run, per-board results, and a banner for anything failing. */
export default function HealthPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-col gap-6 md:h-full">
      <h1 className="text-2xl font-semibold tracking-tight">Health</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Health searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
