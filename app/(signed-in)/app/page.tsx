import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ownerContext } from "@/server/auth/require-owner";
import { getOverview, type Tile } from "@/server/modules/dashboard/overview.service";
import { cn } from "@/shared/cn";
import { ago, formatSalary } from "@/shared/format";
import { InfoTip } from "../_components/info-tip";
import { statusInfo, type Tone } from "../_components/status";

/** Left accent per tone, so "waiting on you" numbers stand out from the rest. */
const TONE_ACCENT: Record<Tone, string> = {
  warning: "border-l-4 border-l-warning",
  info: "border-l-4 border-l-info",
  success: "border-l-4 border-l-success",
  muted: "",
  destructive: "border-l-4 border-l-destructive",
};

function TileCard({ t }: { t: Tile }) {
  const tone = t.status ? statusInfo(t.status).tone : "muted";
  const accent = t.value > 0 ? TONE_ACCENT[tone] : "";
  const number = <div className="text-2xl font-semibold tabular-nums">{t.value.toLocaleString()}</div>;
  return (
    <Card size="sm" className={cn(accent, t.href && "transition-colors hover:bg-muted/50")}>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          {t.label}
          <InfoTip label={`About ${t.label}`}>{t.hint}</InfoTip>
        </CardDescription>
        {t.href ? <Link href={t.href} className="hover:underline">{number}</Link> : number}
      </CardHeader>
    </Card>
  );
}

function Tiles({ tiles, className }: { tiles: Tile[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", className)}>
      {tiles.map((t) => <TileCard key={t.label} t={t} />)}
    </div>
  );
}

async function Overview() {
  const { db, owner } = await ownerContext();
  const now = new Date();
  const o = await getOverview(db, owner.id, now);

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">Discovery</h2>
          {o.lastRun ? (
            <Badge variant={o.lastRun.ok ? "secondary" : "destructive"}>
              Last run {o.lastRun.ok ? "OK" : "failed"} · {ago(o.lastRun.started_at, now)}
            </Badge>
          ) : (
            <Badge variant="outline">Not run yet</Badge>
          )}
        </div>
        <Tiles tiles={o.jobs} className="lg:grid-cols-5" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Applications</h2>
        <p className="-mt-2 text-sm text-muted-foreground">
          Each application is in exactly one stage. Prepared ones wait on you first; approved ones move along the bottom row.
        </p>
        <h3 className="text-sm font-medium text-muted-foreground">Waiting on you</h3>
        <Tiles tiles={o.waiting} />
        <h3 className="text-sm font-medium text-muted-foreground">On their way</h3>
        <Tiles tiles={o.progress} className="xl:grid-cols-6" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Newest jobs</CardTitle>
          <CardDescription>The latest open jobs discovery found.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {o.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="hidden sm:table-cell">Salary</TableHead>
                  <TableHead className="text-right">Found</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.recent.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="max-w-xs whitespace-normal">
                      <Link href={`/app/jobs/${j.id}`} className="font-medium hover:underline">{j.title}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{j.company_name}</TableCell>
                    <TableCell className="hidden tabular-nums text-muted-foreground sm:table-cell">
                      {formatSalary(j.salary_min, j.salary_max, j.salary_currency) || "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{ago(j.first_seen_at, now)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div>
            <Link href="/app/jobs" className={buttonVariants({ variant: "outline", size: "sm" })}>All jobs</Link>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/** Overview: job discovery numbers, applications by stage, and the newest jobs. */
export default function OverviewPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Overview />
      </Suspense>
    </main>
  );
}
