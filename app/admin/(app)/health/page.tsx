import { Suspense } from "react";
import { ownerContext } from "@/server/auth/require-owner";
import { loadDiscoveryHealth } from "@/server/modules/runs/runs.service";
import { ago } from "@/shared/format";

const COUNT_LABELS: [string, string][] = [
  ["fetched", "listed"], ["filtered", "filtered out"], ["inserted", "new"], ["duplicates", "duplicates"], ["closed", "closed"],
];

function Counts({ counts }: { counts: Record<string, number> | null | undefined }) {
  if (!counts) return <>—</>;
  return <>{COUNT_LABELS.filter(([k]) => counts[k]).map(([k, label]) => `${counts[k]} ${label}`).join(" · ") || "no changes"}</>;
}

async function Health() {
  const { db } = await ownerContext();
  const now = new Date();
  const { boards, worker, workerProblem } = await loadDiscoveryHealth(db, now);
  const active = boards.filter((b) => b.active && b.board_token && b.ats !== "other");
  const problems = [
    ...(workerProblem ? [`Discovery ${workerProblem}.`] : []),
    ...active.filter((b) => b.problem).map((b) => `${b.name} (${b.ats}:${b.board_token}) ${b.problem}.`),
  ];

  return (
    <>
      {problems.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <p className="font-semibold">Needs attention</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Discovery (every 30 minutes)</h2>
        <p className="text-sm">
          Last run: {worker ? `${worker.ok ? "ok" : "failed"} · ${ago(worker.started_at, now)}` : "never"}
          {worker?.counts && (
            <span className="text-zinc-500">
              {" "}— {worker.counts.ok ?? 0} boards ok, {worker.counts.failed ?? 0} failed, {worker.counts.skipped ?? 0} backing off ·{" "}
              <Counts counts={worker.counts} />
            </span>
          )}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Boards</h2>
        {active.length === 0 ? (
          <p className="text-sm text-zinc-500">No active boards. Add companies on the Companies page.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="py-2 pr-4">Board</th>
                  <th className="py-2 pr-4">Last run</th>
                  <th className="py-2 pr-4">Last success</th>
                  <th className="py-2 pr-4">Last result</th>
                </tr>
              </thead>
              <tbody>
                {active.map((b) => (
                  <tr key={b.id} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                    <td className="py-2 pr-4">
                      <div className="font-medium">{b.name}</div>
                      <div className="font-mono text-xs text-zinc-500">{b.ats}:{b.board_token}</div>
                    </td>
                    <td className={`py-2 pr-4 ${b.problem ? "text-red-600" : ""}`}>
                      {b.status ? `${b.status.last_ok ? "ok" : "failed"} · ${ago(b.status.last_run_at, now)}` : "not yet"}
                      {b.problem && <div className="text-xs">{b.problem}</div>}
                    </td>
                    <td className="py-2 pr-4">{ago(b.status?.last_success_at, now)}</td>
                    <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">
                      {b.status?.last_ok === false ? (
                        <span className="text-red-600">{b.status.last_error}</span>
                      ) : (
                        <Counts counts={b.status?.last_counts} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/** Health: discovery schedule status, per-board results and a banner for anything failing. */
export default function HealthPage() {
  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Health</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Health />
      </Suspense>
    </main>
  );
}
