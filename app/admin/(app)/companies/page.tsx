import { Suspense } from "react";
import { ownerContext } from "@/server/auth/require-owner";
import { getTitleFilter } from "@/server/modules/companies/companies.service";
import { loadDiscoveryHealth } from "@/server/modules/runs/runs.service";
import { ago } from "@/shared/format";
import { toggleCompanyAction } from "./actions";
import { AddCompanyForm, FilterForm } from "./forms";

async function Companies() {
  const { db } = await ownerContext();
  const now = new Date();
  const [{ boards }, filter] = await Promise.all([loadDiscoveryHealth(db, now), getTitleFilter(db)]);

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Add a company</h2>
        <p className="text-sm text-zinc-500">
          The board token is the name in the company&apos;s job-board URL, e.g. boards.greenhouse.io/<b>stripe</b>,
          jobs.lever.co/<b>palantir</b>, jobs.ashbyhq.com/<b>ramp</b>.
        </p>
        <AddCompanyForm />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Boards ({boards.filter((b) => b.active).length} active)</h2>
        {boards.length === 0 ? (
          <p className="text-sm text-zinc-500">No companies yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="py-2 pr-4">Company</th>
                  <th className="py-2 pr-4">Board</th>
                  <th className="py-2 pr-4">Priority</th>
                  <th className="py-2 pr-4">Last check</th>
                  <th className="py-2 pr-4">Open jobs listed</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {boards.map((b) => (
                  <tr key={b.id} className={`border-t border-zinc-200 dark:border-zinc-800 ${b.active ? "" : "text-zinc-400"}`}>
                    <td className="py-2 pr-4 font-medium">{b.name}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{b.ats}:{b.board_token}</td>
                    <td className="py-2 pr-4 tabular-nums">{b.priority}</td>
                    <td className="py-2 pr-4">
                      {b.status ? (
                        <span className={b.status.last_ok ? "" : "text-red-600"}>
                          {b.status.last_ok ? "ok" : "failed"} · {ago(b.status.last_run_at, now)}
                        </span>
                      ) : (
                        "not yet"
                      )}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{b.status?.last_counts?.fetched ?? "—"}</td>
                    <td className="py-2 text-right">
                      <form action={toggleCompanyAction}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="active" value={String(!b.active)} />
                        <button type="submit" className="underline">{b.active ? "Pause" : "Resume"}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Title filter</h2>
        <p className="text-sm text-zinc-500">
          Applied before jobs are saved. Whole words, case-insensitive, comma-separated. Skipped jobs are counted on the Health page.
        </p>
        <FilterForm include={filter.include} exclude={filter.exclude} />
      </section>
    </>
  );
}

/** Companies: add and test boards, pause or resume them, and edit the title filter. */
export default function CompaniesPage() {
  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Companies</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Companies />
      </Suspense>
    </main>
  );
}
