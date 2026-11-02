import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ownerContext } from "@/server/auth/require-owner";
import { loadDiscoveryHealth } from "@/server/modules/runs/runs.service";
import { paginate, parsePage } from "@/shared/paginate";
import { BoardStatus } from "../../_components/board-status";
import { Pager, scrollingTable } from "../../_components/data-table";
import { toggleCompanyAction } from "./actions";
import { AddCompanyForm, FindCompanyForm } from "./forms";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function Companies({ searchParams }: { searchParams: SearchParams }) {
  const { db, owner } = await ownerContext();
  const now = new Date();
  const [{ boards }, params] = await Promise.all([loadDiscoveryHealth(db, owner.id, now), searchParams]);
  const active = boards.filter((b) => b.active).length;
  const page = paginate(boards, parsePage(params.page));

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
            {active.toLocaleString()} active of {boards.length.toLocaleString()}.
          </CardDescription>
        </CardHeader>
        <CardContent className={scrollingTable.content}>
          {boards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No companies yet.</p>
          ) : (
            <>
            <Table containerClassName={scrollingTable.container}>
              <TableHeader className={scrollingTable.header}>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Board</TableHead>
                  <TableHead>Last check</TableHead>
                  <TableHead className="text-right">Listed</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((b) => (
                  <TableRow key={b.id} className={b.active ? "" : "text-muted-foreground"}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="font-mono text-xs">{b.ats}:{b.board_token}</TableCell>
                    <TableCell><BoardStatus board={b} now={now} /></TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.status?.last_counts?.fetched?.toLocaleString() ?? "—"}
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

/** Admin > Companies: find and add job boards, and pause or resume them. */
export default function CompaniesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-col gap-6 md:h-full">
      <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Companies searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
