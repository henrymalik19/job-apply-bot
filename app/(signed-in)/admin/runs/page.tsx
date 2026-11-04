import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminContext } from "@/server/auth/require-owner";
import { listRunFilters, listRunRows, type RunQuery } from "@/server/modules/apply/apply-runs";
import { ago } from "@/shared/format";
import type { Page } from "@/shared/paginate";
import { Pager, scrollingTable } from "../../_components/data-table";
import { TableSkeleton } from "../../_components/skeletons";
import { TONE_BADGE } from "../../_components/status";
import { RunFiltersBar } from "./run-filters";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const PAGE_SIZE = 25;

async function Runs({ searchParams }: { searchParams: SearchParams }) {
  // Everyone's runs: read with the admin client.
  const [{ admin }, params] = await Promise.all([adminContext(), searchParams]);
  const userId = one(params.user);
  const applicationId = one(params.application);
  const result = (["submitted", "handed_back"].includes(one(params.result)) ? one(params.result) : "") as NonNullable<RunQuery["result"]> | "";
  const pageNo = Math.max(1, Number(one(params.page)) || 1);
  const [filters, { rows, total }] = await Promise.all([
    listRunFilters(admin),
    listRunRows(admin, { userId: userId || undefined, applicationId: applicationId || undefined, result: result || undefined, page: pageNo, pageSize: PAGE_SIZE }),
  ]);
  const page: Page<unknown> = {
    items: rows,
    page: pageNo,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    pageSize: PAGE_SIZE,
    total,
    from: total ? (pageNo - 1) * PAGE_SIZE + 1 : 0,
    to: (pageNo - 1) * PAGE_SIZE + rows.length,
  };
  const keep = Object.fromEntries(Object.entries({ user: userId, application: applicationId, result }).filter(([, v]) => v)) as Record<string, string>;
  const now = new Date();
  return (
    <>
      <RunFiltersBar filters={filters} userId={userId} applicationId={applicationId} result={result} />
      <Card className={scrollingTable.card}>
        <CardContent className={scrollingTable.content}>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs match. They show here once the apply runner finishes one.</p>
          ) : (
            <>
              <Table containerClassName={scrollingTable.container}>
                <TableHeader className={scrollingTable.header}>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Person</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Fields</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const submitted = r.outcome === "submitted";
                    const c = r.counts;
                    return (
                      <TableRow key={r.id} className="relative">
                        <TableCell className="text-muted-foreground" title={new Date(r.startedAt).toLocaleString()}>{ago(r.startedAt, now)}</TableCell>
                        <TableCell className="max-w-sm whitespace-normal">
                          {/* The whole row opens the run; the link covers it. */}
                          <Link href={`/admin/runs/${r.id}`} className="font-medium after:absolute after:inset-0 hover:underline">
                            {r.application.title || "A job"}
                          </Link>
                          <span className="block text-xs text-muted-foreground">{r.application.company}</span>
                        </TableCell>
                        <TableCell>{r.user.name}</TableCell>
                        <TableCell className="max-w-xs whitespace-normal">
                          <Badge className={submitted ? TONE_BADGE.success : TONE_BADGE.warning}>{submitted ? "Submitted" : "Handed back"}</Badge>
                          {!submitted && <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground" title={r.outcome}>{r.outcome.replace(/^handed back: /, "")}</span>}
                        </TableCell>
                        <TableCell className="whitespace-normal text-sm">
                          {c ? (
                            <span className="flex flex-wrap gap-x-2">
                              <span className="text-success">{c.ok} filled</span>
                              {c.not_filled + c.error > 0 && <span className="text-warning">{c.not_filled + c.error} couldn&apos;t</span>}
                              {c.absent > 0 && <span className="text-muted-foreground">{c.absent} not on form</span>}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Pager page={page} basePath="/admin/runs" params={keep} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** Runs: the apply runner's attempts, everyone's, newest first; each opens on its own page. */
export default function RunsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-col gap-4 md:h-full">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Runs</h1>
        <p className="text-sm text-muted-foreground">
          Every attempt the apply runner made, newest first. Open one for its screenshots and every field it filled or
          couldn&apos;t.
        </p>
      </div>
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <Runs searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
