import { Suspense } from "react";
import { requireOwner } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";
import { APP_STATUSES, type AppStatus } from "@/lib/transition";

const FUNNEL: AppStatus[] = ["queued", "approved", "submitted", "confirmed", "responded", "interviewing", "offer"];

async function Overview() {
  await requireOwner();
  const db = await createUserClient();

  const [jobs, apps, needsYou] = await Promise.all([
    db.from("jobs").select("id", { count: "exact", head: true }),
    db.from("applications").select("status"),
    db.from("applications").select("id", { count: "exact", head: true }).in("status", ["needs_input", "manual"]),
  ]);
  const err = jobs.error ?? apps.error ?? needsYou.error;
  if (err) throw new Error(`overview query failed: ${err.message}`);

  const byStatus = Object.fromEntries(APP_STATUSES.map((s) => [s, 0])) as Record<AppStatus, number>;
  for (const row of apps.data ?? []) byStatus[row.status as AppStatus]++;

  const tiles = [
    { label: "Discovered", value: jobs.count ?? 0 },
    ...FUNNEL.map((s) => ({ label: s.replace("_", " "), value: byStatus[s] })),
    { label: "Needs you", value: needsYou.count ?? 0 },
  ];

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
