import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ownerContext } from "@/server/auth/require-owner";
import { getOverview, type Tile } from "@/server/modules/dashboard/overview.service";
import { ago, formatSalary } from "@/shared/format";

function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {tiles.map((t) => (
        <Card key={t.label} size="sm">
          <CardHeader>
            <CardDescription className="capitalize">{t.label}</CardDescription>
            <div className="text-2xl font-semibold tabular-nums">{t.value.toLocaleString()}</div>
          </CardHeader>
        </Card>
      ))}
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
        <Tiles tiles={o.jobs} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">Applications</h2>
          {o.needsYou > 0 && <Badge variant="destructive">{o.needsYou} need you</Badge>}
        </div>
        <Tiles tiles={o.funnel} />
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
            <ul className="divide-y">
              {o.recent.map((j) => (
                <li key={j.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
                  <Link href={`/app/jobs/${j.id}`} className="font-medium hover:underline">{j.title}</Link>
                  <span className="text-muted-foreground">
                    {[j.company_name, formatSalary(j.salary_min, j.salary_max, j.salary_currency), `found ${ago(j.first_seen_at, now)}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div>
            <Link href="/app/jobs" className={buttonVariants({ variant: "outline", size: "sm" })}>All jobs</Link>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/** Overview: job discovery numbers, the application funnel, and the newest jobs. */
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
