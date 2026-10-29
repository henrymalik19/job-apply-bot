import { Suspense } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ownerContext } from "@/server/auth/require-owner";
import { formatMinutes, loadDiscoveryHealth } from "@/server/modules/runs/runs.service";
import { ago } from "@/shared/format";
import { BoardStatus, RunCounts } from "../_components/board-status";

async function Health() {
  const { db } = await ownerContext();
  const now = new Date();
  const { boards, worker, workerProblem, intervalMinutes } = await loadDiscoveryHealth(db, now);
  const active = boards.filter((b) => b.active && b.board_token && b.ats !== "other");
  const problems = [
    ...(workerProblem ? [`Discovery ${workerProblem}.`] : []),
    ...active.filter((b) => b.problem).map((b) => `${b.name} (${b.ats}:${b.board_token}) ${b.problem}.`),
  ];
  // Problem boards first, then by name.
  const rows = [...active].sort((a, b) => Number(!!b.problem) - Number(!!a.problem) || a.name.localeCompare(b.name));

  return (
    <>
      {problems.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Discovery</CardTitle>
          <CardDescription>Runs every {formatMinutes(intervalMinutes)} on Railway.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {worker ? (
            <>
              <Badge variant={worker.ok ? "secondary" : "destructive"}>
                {worker.ok ? "OK" : "Failed"} · {ago(worker.started_at, now)}
              </Badge>
              <span>
                {(worker.counts?.ok ?? 0).toLocaleString()} boards OK · {worker.counts?.failed ?? 0} failed ·{" "}
                {worker.counts?.skipped ?? 0} backing off
              </span>
              <RunCounts counts={worker.counts} />
            </>
          ) : (
            <span className="text-muted-foreground">Has not run yet.</span>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Boards</CardTitle>
          <CardDescription>{active.length.toLocaleString()} active boards, problems first.</CardDescription>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active boards. Add companies on the Companies page.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Board</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Last success</TableHead>
                  <TableHead>Last result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((b) => (
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
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** Health: discovery schedule status, per-board results and a banner for anything failing. */
export default function HealthPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Health</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Health />
      </Suspense>
    </main>
  );
}
