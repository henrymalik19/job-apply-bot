import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ownerContext } from "@/server/auth/require-owner";
import { filtersToParams, parseJobFilters, type JobFilters } from "@/server/modules/jobs/jobs.service";
import { browseJobs } from "@/server/modules/matching/matching.service";
import { ago, formatSalary } from "@/shared/format";
import { parsePage } from "@/shared/paginate";
import { Pager, scrollingTable } from "../../_components/data-table";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function Filters({ filters }: { filters: JobFilters }) {
  return (
    // A plain GET form: filters live in the URL, so they survive reloads and links.
    <form method="get" className="flex flex-wrap items-end gap-3">
      <Input name="q" defaultValue={filters.q} placeholder="Title or company" className="w-64" aria-label="Search title or company" />
      <NativeSelect name="match" defaultValue={filters.match} aria-label="Match">
        <NativeSelectOption value="any">All jobs</NativeSelectOption>
        <NativeSelectOption value="matched">Matched (at or above threshold)</NativeSelectOption>
      </NativeSelect>
      <NativeSelect name="remote" defaultValue={filters.remote} aria-label="Remote">
        <NativeSelectOption value="any">Any location type</NativeSelectOption>
        <NativeSelectOption value="remote">Remote</NativeSelectOption>
        <NativeSelectOption value="hybrid">Hybrid</NativeSelectOption>
        <NativeSelectOption value="onsite">On-site</NativeSelectOption>
        <NativeSelectOption value="unknown">Not stated</NativeSelectOption>
      </NativeSelect>
      <NativeSelect name="posted" defaultValue={filters.posted} aria-label="Posted within">
        <NativeSelectOption value="7">Posted in last 7 days</NativeSelectOption>
        <NativeSelectOption value="30">Posted in last 30 days</NativeSelectOption>
        <NativeSelectOption value="90">Posted in last 90 days</NativeSelectOption>
        <NativeSelectOption value="any">Posted any time</NativeSelectOption>
      </NativeSelect>
      <NativeSelect name="found" defaultValue={filters.found} aria-label="Found">
        <NativeSelectOption value="any">Found any time</NativeSelectOption>
        <NativeSelectOption value="1">Found in last 24h</NativeSelectOption>
        <NativeSelectOption value="7">Found in last 7 days</NativeSelectOption>
        <NativeSelectOption value="30">Found in last 30 days</NativeSelectOption>
      </NativeSelect>
      <NativeSelect name="state" defaultValue={filters.state} aria-label="Open or closed">
        <NativeSelectOption value="open">Open</NativeSelectOption>
        <NativeSelectOption value="closed">Closed</NativeSelectOption>
        <NativeSelectOption value="all">Open and closed</NativeSelectOption>
      </NativeSelect>
      <NativeSelect name="sort" defaultValue={filters.sort} aria-label="Sort">
        <NativeSelectOption value="found">Newest found</NativeSelectOption>
        <NativeSelectOption value="posted">Newest posted</NativeSelectOption>
        <NativeSelectOption value="score">Best score</NativeSelectOption>
      </NativeSelect>
      <Button type="submit">Apply</Button>
      <Link href="/app/jobs" className={buttonVariants({ variant: "ghost" })}>Reset</Link>
    </form>
  );
}

const REMOTE_LABEL: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

function ScoreBadge({ score, status, threshold }: { score: number | null; status: string | null; threshold: number }) {
  if (status === "filtered") return <span className="text-xs text-muted-foreground">filtered</span>;
  if (status === "failed") return <span className="text-xs text-destructive">failed</span>;
  if (score == null) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={score >= threshold ? "default" : "secondary"} className="tabular-nums">{score}</Badge>;
}

async function Jobs({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await ownerContext();
  const params = await searchParams;
  const filters = parseJobFilters(params);
  const now = new Date();
  const { page, threshold } = await browseJobs(db, filters, parsePage(params.page), now);
  const keep = filtersToParams(filters);
  const detailQuery = new URLSearchParams({ ...keep, ...(page.page > 1 ? { page: String(page.page) } : {}) }).toString();

  return (
    <Card className={scrollingTable.card}>
      <CardHeader>
        <CardTitle>{page.total.toLocaleString()} jobs</CardTitle>
        <CardDescription>Jobs discovered from your companies&apos; boards that passed the title filter.</CardDescription>
      </CardHeader>
      <CardContent className={scrollingTable.content}>
        <div className="pb-4">
          <Filters filters={filters} />
        </div>
        {page.total === 0 ? (
          <p className="text-sm text-muted-foreground">No jobs match these filters.</p>
        ) : (
          <>
            <Table containerClassName={scrollingTable.container}>
              <TableHeader className={scrollingTable.header}>
                <TableRow>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead>Found</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((j) => (
                  <TableRow key={j.id} className={j.closed_at ? "text-muted-foreground" : ""}>
                    <TableCell className="text-right">
                      <ScoreBadge score={j.score} status={j.matchStatus} threshold={threshold} />
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      <Link href={`/app/jobs/${j.id}${detailQuery ? `?${detailQuery}` : ""}`} className="font-medium hover:underline">
                        {j.title}
                      </Link>
                      {j.closed_at && <Badge variant="outline" className="ml-2">Closed</Badge>}
                    </TableCell>
                    <TableCell>{j.company_name}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal">
                      <span className="text-muted-foreground">{j.location ?? "—"}</span>
                      {j.remote_type && REMOTE_LABEL[j.remote_type] && (
                        <Badge variant="secondary" className="ml-2">{REMOTE_LABEL[j.remote_type]}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatSalary(j.salary_min, j.salary_max, j.salary_currency) || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{j.posted_at ? ago(j.posted_at, now) : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{ago(j.first_seen_at, now)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={page} basePath="/app/jobs" params={keep} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Jobs: every discovered job with its match score, filterable and sortable (including by score), 50 per page. */
export default function JobsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-col gap-6 md:h-full">
      <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Jobs searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
