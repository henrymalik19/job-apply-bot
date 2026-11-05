import Link from "next/link";
import { Suspense } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminContext } from "@/server/auth/require-owner";
import { listFailedFields, type FailedFieldSummary } from "@/server/modules/apply/apply-runs";
import { shownValue } from "@/server/modules/apply/run-log";
import { loadMatchingHealth } from "@/server/modules/matching/matching.service";
import { getSpendSummary, type SpendSummary } from "@/server/modules/usage/usage.service";
import { formatMinutes, loadDiscoveryHealth, loadWorkerHealth, type WorkerHealth } from "@/server/modules/runs/runs.service";
import { serverEnv } from "@/shared/env";
import { ago } from "@/shared/format";
import { LiveRefresh } from "../../_components/live-refresh";
import { RunNow } from "./run-now";
import { TableSkeleton } from "../../_components/skeletons";

const n = (v: number | undefined) => (v ?? 0).toLocaleString();

/** Dollars, with enough places that a fraction of a cent still shows. */
const usd = (v: number | null) => (v == null ? "—" : `$${v < 0.1 ? v.toFixed(3) : v.toFixed(2)}`);

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
        ? `${n(c.queued)} ready · ${n(c.needs_input)} need you · ${n(c.manual)} can't fill${c.deferred ? ` · ${n(c.deferred)} over the daily cap` : ""}${c.restarted ? ` · ${n(c.restarted)} started over` : ""}`
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

async function Health() {
  const { db, owner, admin } = await adminContext();
  const now = new Date();
  const [{ boards }, workers, matching, spend, failed] = await Promise.all([
    loadDiscoveryHealth(db, owner.id, now),
    loadWorkerHealth(db, owner.id, now),
    loadMatchingHealth(db, owner.id, now),
    getSpendSummary(db, owner.id, now),
    listFailedFields(admin, new Date(now.getTime() - FAILED_DAYS * 86_400_000)),
  ]);
  const canRun = !!serverEnv().RAILWAY_TOKEN;
  const failing = boards.filter((b) => b.active && b.board_token && b.ats !== "other" && b.problem).length;
  const problems: { key: string; text: React.ReactNode }[] = [
    ...workers.filter((w) => w.problem).map((w) => ({ key: w.name, text: `The ${w.name} worker ${w.problem}.` })),
    ...(matching.capReached ? [{ key: "cap", text: `Monthly LLM spend cap (${matching.spend.cap}) reached; scoring is paused until next month.` }] : []),
    ...(failing
      ? [{ key: "boards", text: <>{failing.toLocaleString()} {failing === 1 ? "board is" : "boards are"} failing. <Link href="/admin/companies" className="underline underline-offset-2">See Companies</Link>.</> }]
      : []),
  ];

  return (
    <>
      {problems.length > 0 && (
        <Alert variant="destructive" className="shrink-0">
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {problems.map((p) => <li key={p.key}>{p.text}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card className="shrink-0">
        <CardHeader>
          <CardTitle>Workers</CardTitle>
          <CardDescription>
            Each runs on its own Railway schedule (UTC) and is flagged after two missed runs. Run now starts one off schedule
            (notify also checks the job inbox).
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
                <TableHead className="w-0"><span className="sr-only">Run</span></TableHead>
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
                  <TableCell className="align-top"><RunNow worker={w.name} enabled={canRun} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <FailedFieldsCard fields={failed} now={now} />

      <SpendCard spend={spend} />
    </>
  );
}

/** How far back Health lists fields the runner couldn't fill. */
const FAILED_DAYS = 7;

/** Fields the apply runner couldn't fill in the last week, across everyone's runs: still failing first. */
function FailedFieldsCard({ fields, now }: { fields: FailedFieldSummary[]; now: Date }) {
  const failing = fields.filter((f) => f.recovered < f.runs).length;
  return (
    <Card className="shrink-0">
      <CardHeader>
        <CardTitle>Fields the runner couldn&apos;t fill</CardTitle>
        <CardDescription>
          The last {FAILED_DAYS} days, by company and field.{" "}
          {fields.length === 0
            ? "Every field took its value."
            : `${failing.toLocaleString()} still failing; the rest took another value (one learned, or Claude's) on a retry.`}
        </CardDescription>
      </CardHeader>
      {fields.length > 0 && (
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Tried</TableHead>
                <TableHead>Runs</TableHead>
                <TableHead>Last</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((f) => (
                <TableRow key={`${f.company}-${f.label}`}>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{f.label}</div>
                    <div className="text-xs text-muted-foreground">{f.company} · {f.kind}</div>
                  </TableCell>
                  <TableCell className="max-w-64 whitespace-normal">
                    <div className="truncate">{shownValue(f.lastValue)}</div>
                    {f.lastDetail && <div className="text-xs text-destructive">{f.lastDetail}</div>}
                  </TableCell>
                  <TableCell>
                    {f.recovered === f.runs ? (
                      <Badge variant="secondary">fixed on retry · {f.runs}</Badge>
                    ) : (
                      <Badge variant="destructive">
                        {f.runs - f.recovered} failing{f.recovered ? ` · ${f.recovered} fixed` : ""}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/runs/${f.lastRunId}`} className="underline underline-offset-2">{ago(f.lastAt, now)}</Link>
                    {f.users.length > 0 && <div className="text-xs text-muted-foreground">{f.users.join(", ")}</div>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  );
}

/** This month's Claude spend: per application, per scored job, and by kind of call. */
function SpendCard({ spend }: { spend: SpendSummary & { cap: number; applicationsLeft: number | null } }) {
  const stats = [
    { label: "Per application", value: usd(spend.perApplication), hint: `preparing and filling, over ${n(spend.applications)} this month` },
    { label: "Per application, all in", value: usd(spend.allInPerApplication), hint: "everything this month, scoring and email too" },
    { label: "Per job scored", value: usd(spend.perScore), hint: `${n(spend.scored)} jobs scored` },
    {
      label: "Room left",
      value: spend.applicationsLeft == null ? "—" : `~${n(spend.applicationsLeft)}`,
      hint: "more applications at this month's rate",
    },
  ];
  return (
    <Card className="shrink-0">
      <CardHeader>
        <CardTitle>Claude spend</CardTitle>
        <CardDescription>
          {usd(spend.total)} of {usd(spend.cap)} this month. Past the cap, scoring and preparing pause until the 1st.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-xl font-semibold tabular-nums">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.hint}</div>
            </div>
          ))}
        </div>
        {spend.byPurpose.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>For</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {spend.byPurpose.map((p) => (
                <TableRow key={p.purpose}>
                  <TableCell className="whitespace-normal">{p.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{n(p.calls)}</TableCell>
                  <TableCell className="text-right tabular-nums">{usd(p.cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/** Health: each worker's schedule and last run, Claude spend, and a banner for anything failing (boards link to Companies). */
export default function HealthPage() {
  return (
    <main className="flex flex-col gap-6 md:h-full">
      <LiveRefresh />
      <h1 className="text-2xl font-semibold tracking-tight">Health</h1>
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Health />
      </Suspense>
    </main>
  );
}
