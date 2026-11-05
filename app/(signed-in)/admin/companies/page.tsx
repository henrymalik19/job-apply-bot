import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ownerContext } from "@/server/auth/require-owner";
import { loadDiscoveryHealth } from "@/server/modules/runs/runs.service";
import { listCompanyLimits, type CompanyLimit } from "@/server/modules/companies/apply-limits";
import { ago } from "@/shared/format";
import { paginate, parsePage } from "@/shared/paginate";
import { BoardStatus, RunCounts } from "../../_components/board-status";
import { cardsOnPhone, Pager, scrollingTable } from "../../_components/data-table";
import { clearLimitAction, toggleCompanyAction } from "./actions";
import { AddCompanyForm, FindCompanyForm } from "./forms";
import { TableSkeleton } from "../../_components/skeletons";
import { MovedBoard } from "../health/moved-board";

/** A board fetch that failed because the board no longer exists (it may have moved to another ATS). */
const boardGone = (error: string | null | undefined) => /\b404\b/.test(error ?? "");

/** A company's limit on applications, and the date you can apply there again when you've reached it. */
function LimitNote({ companyId, limit }: { companyId: string; limit: CompanyLimit | undefined }) {
  if (!limit) return null;
  const rule = limit.limit ? `Takes ${limit.limit} ${limit.limit === 1 ? "application" : "applications"} per ${limit.days} days` : "Has a limit on applications";
  const until = limit.pausedUntil ? new Date(limit.pausedUntil).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  return (
    <form action={clearLimitAction} className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-warning" title={limit.reason ?? undefined}>
      <span>
        {rule}
        {until && <>; you can apply again on {until}</>}
      </span>
      <input type="hidden" name="id" value={companyId} />
      <Button type="submit" variant="link" size="xs" className="h-auto p-0 text-xs" title="It no longer has a limit, or the date is wrong">Clear</Button>
    </form>
  );
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function Companies({ searchParams }: { searchParams: SearchParams }) {
  const { db, owner } = await ownerContext();
  const now = new Date();
  const [{ boards }, params, limits] = await Promise.all([loadDiscoveryHealth(db, owner.id, now), searchParams, listCompanyLimits(db, owner.id, now)]);
  const active = boards.filter((b) => b.active).length;
  const failing = boards.filter((b) => b.problem).length;
  // Failing boards first, then by name.
  const rows = [...boards].sort((a, b) => Number(!!b.problem) - Number(!!a.problem) || a.name.localeCompare(b.name));
  const page = paginate(rows, parsePage(params.page));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Add a company</CardTitle>
          <CardDescription>
            Type the company&apos;s name to look for its Greenhouse, Lever or Ashby board, or paste a link to the board or one of its
            postings. New boards are checked on the next discovery run.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FindCompanyForm />
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Know the board token? Enter it yourself</summary>
            <p className="mt-2 mb-3 text-muted-foreground">
              The token is the name in the board&apos;s URL, e.g. job-boards.greenhouse.io/<b>stripe</b>, jobs.lever.co/<b>palantir</b>,
              jobs.ashbyhq.com/<b>ramp</b>.
            </p>
            <AddCompanyForm />
          </details>
        </CardContent>
      </Card>

      <Card className={scrollingTable.card}>
        <CardHeader>
          <CardTitle>Boards</CardTitle>
          <CardDescription>
            {active.toLocaleString()} active of {boards.length.toLocaleString()}
            {failing > 0 && <span className="text-destructive">, {failing.toLocaleString()} failing (listed first)</span>}.
          </CardDescription>
        </CardHeader>
        <CardContent className={scrollingTable.content}>
          {boards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No companies yet.</p>
          ) : (
            <>
            <Table className={cardsOnPhone.table} containerClassName={scrollingTable.container}>
              <TableHeader className={scrollingTable.header}>
                <TableRow>
                  <TableHead>Board</TableHead>
                  <TableHead>Last check</TableHead>
                  <TableHead>Last success</TableHead>
                  <TableHead>Last result</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((b) => (
                  <TableRow key={b.id} className={b.active ? "" : "text-muted-foreground"}>
                    <TableCell className={cardsOnPhone.first}>
                      <div className="font-medium">{b.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{b.ats}:{b.board_token}</div>
                      <LimitNote companyId={b.id} limit={limits.get(b.id)} />
                    </TableCell>
                    <TableCell data-label="Last check">
                      <BoardStatus board={b} now={now} />
                      {b.problem && <div className="mt-1 text-xs text-destructive">{b.problem}</div>}
                    </TableCell>
                    <TableCell data-label="Last success">{ago(b.status?.last_success_at, now)}</TableCell>
                    <TableCell data-label="Last result" className="whitespace-normal">
                      {b.status?.last_ok === false ? (
                        <>
                          <span className="text-destructive">{b.status.last_error}</span>
                          {/* A board that's gone may have moved to another ATS. */}
                          {boardGone(b.status.last_error) && b.board_token && (
                            <Suspense fallback={<span className="mt-1 block text-xs text-muted-foreground">Looking for a new board…</span>}>
                              <MovedBoard company={{ id: b.id, name: b.name, ats: b.ats, board_token: b.board_token }} />
                            </Suspense>
                          )}
                        </>
                      ) : (
                        <RunCounts counts={b.status?.last_counts} />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={toggleCompanyAction}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="active" value={String(!b.active)} />
                        <Button type="submit" variant="ghost" size="xs">{b.active ? "Pause" : "Resume"}</Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={page} basePath="/admin/companies" />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** Admin > Companies: find and add job boards, see how each one's last check went, and pause or resume them. */
export default function CompaniesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-col gap-6 md:h-full">
      <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
      <Suspense fallback={<TableSkeleton />}>
        <Companies searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
