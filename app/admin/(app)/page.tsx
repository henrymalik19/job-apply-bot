import { Suspense } from "react";
import { ownerContext } from "@/server/auth/require-owner";
import { getOverviewTiles } from "@/server/modules/dashboard/overview.service";

async function Overview() {
  const { db } = await ownerContext();
  const tiles = await getOverviewTiles(db);

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="text-xs uppercase tracking-wide text-zinc-500">{t.label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{t.value}</div>
        </div>
      ))}
    </section>
  );
}

/** Admin overview: discovered jobs, the application funnel and what needs you. */
export default function AdminOverviewPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Overview</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Overview />
      </Suspense>
    </main>
  );
}
