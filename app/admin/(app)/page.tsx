import { Suspense } from "react";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { ownerContext } from "@/server/auth/require-owner";
import { getOverviewTiles } from "@/server/modules/dashboard/overview.service";

async function Overview() {
  const { db } = await ownerContext();
  const tiles = await getOverviewTiles(db);

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t) => (
        <Card key={t.label} size="sm">
          <CardHeader>
            <CardDescription className="capitalize">{t.label}</CardDescription>
            <div className="text-2xl font-semibold tabular-nums">{t.value.toLocaleString()}</div>
          </CardHeader>
        </Card>
      ))}
    </section>
  );
}

/** Admin overview: discovered jobs, the application funnel and what needs you. */
export default function AdminOverviewPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Overview />
      </Suspense>
    </main>
  );
}
