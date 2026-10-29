import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ownerContext } from "@/server/auth/require-owner";
import { getTitleFilter } from "@/server/modules/companies/companies.service";
import { loadDiscoveryHealth } from "@/server/modules/runs/runs.service";
import { BoardStatus } from "../_components/board-status";
import { toggleCompanyAction } from "./actions";
import { AddCompanyForm, FilterForm } from "./forms";

async function Companies() {
  const { db } = await ownerContext();
  const now = new Date();
  const [{ boards }, filter] = await Promise.all([loadDiscoveryHealth(db, now), getTitleFilter(db)]);
  const active = boards.filter((b) => b.active).length;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Add a company</CardTitle>
          <CardDescription>
            The board token is the name in the company&apos;s job-board URL, e.g. boards.greenhouse.io/<b>stripe</b>,
            jobs.lever.co/<b>palantir</b>, jobs.ashbyhq.com/<b>ramp</b>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddCompanyForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Title filter</CardTitle>
          <CardDescription>
            Applied before jobs are saved. Whole words, case-insensitive, comma-separated. Skipped jobs are counted on
            the Health page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FilterForm include={filter.include} exclude={filter.exclude} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Boards</CardTitle>
          <CardDescription>
            {active.toLocaleString()} active of {boards.length.toLocaleString()}. Higher priority boards are checked first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {boards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No companies yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Board</TableHead>
                  <TableHead className="text-right">Priority</TableHead>
                  <TableHead>Last check</TableHead>
                  <TableHead className="text-right">Listed</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {boards.map((b) => (
                  <TableRow key={b.id} className={b.active ? "" : "text-muted-foreground"}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="font-mono text-xs">{b.ats}:{b.board_token}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.priority}</TableCell>
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
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** Companies: add and test boards, pause or resume them, and edit the title filter. */
export default function CompaniesPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Companies />
      </Suspense>
    </main>
  );
}
