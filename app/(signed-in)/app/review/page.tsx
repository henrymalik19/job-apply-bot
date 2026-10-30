import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ownerContext } from "@/server/auth/require-owner";
import { listApplications, REVIEW_STATUSES, type ApplicationWithDetails } from "@/server/modules/applications/applications.service";
import { ago, formatSalary } from "@/shared/format";
import { scrollingTable } from "../../_components/data-table";

/** "14 filled · 2 drafted · 1 to check" for an application's questions. */
function questionSummary(app: ApplicationWithDetails): string {
  const count = (pred: (q: ApplicationWithDetails["questions"][number]) => boolean) => app.questions.filter(pred).length;
  const parts = [
    `${count((q) => q.bucket === "auto")} filled`,
    count((q) => q.bucket === "drafted") ? `${count((q) => q.bucket === "drafted")} drafted` : null,
    count((q) => q.needs_check) ? `${count((q) => q.needs_check)} to check` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

async function ReviewList() {
  const { db } = await ownerContext();
  const apps = await listApplications(db, REVIEW_STATUSES);
  const now = new Date();
  return (
    <Card className={scrollingTable.card}>
      <CardHeader>
        <CardTitle>{apps.length} ready to review</CardTitle>
        <CardDescription>Prepared applications with every required question answered. Open one to check it, then approve or skip.</CardDescription>
      </CardHeader>
      <CardContent className={scrollingTable.content}>
        {apps.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to review. New applications are prepared after each matching run.</p>
        ) : (
          <Table containerClassName={scrollingTable.container}>
            <TableHeader className={scrollingTable.header}>
              <TableRow>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead>Questions</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead>Prepared</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apps.map((a) => {
                const flags = (a.flags as unknown[]) ?? [];
                return (
                  <TableRow key={a.id}>
                    <TableCell className="text-right"><Badge className="tabular-nums">{a.score ?? "—"}</Badge></TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      <Link href={`/app/applications/${a.id}`} className="font-medium hover:underline">{a.job.title}</Link>
                      <div className="text-sm text-muted-foreground">{a.job.company_name}{a.job.location ? ` · ${a.job.location}` : ""}</div>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatSalary(a.job.salary_min, a.job.salary_max, a.job.salary_currency) || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{questionSummary(a)}</TableCell>
                    <TableCell>{flags.length > 0 ? <Badge variant="destructive">{flags.length}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-muted-foreground">{a.prepared_at ? ago(a.prepared_at, now) : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/** Review: applications ready to approve, best score first. */
export default function ReviewPage() {
  return (
    <main className="flex flex-col gap-6 md:h-full">
      <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <ReviewList />
      </Suspense>
    </main>
  );
}
