import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ownerContext } from "@/server/auth/require-owner";
import type { AppStatus } from "@/server/modules/applications/application-status";
import { blockingQuestions, listApplications, type ApplicationWithDetails } from "@/server/modules/applications/applications.service";
import { cn } from "@/shared/cn";
import { ago, formatSalary } from "@/shared/format";
import { scrollingTable } from "../../_components/data-table";
import { SiteBadge } from "../../_components/site-badge";
import { TONE_BADGE } from "../../_components/status";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The two lanes waiting on you before approval, by the application status each holds (ids match todoHref). */
const TABS = [
  {
    id: "ready",
    label: "Ready to approve",
    status: "queued",
    hint: "Every required question is answered. Open one to check it, then approve or skip.",
    empty: "Nothing to approve. New applications are prepared after each matching run.",
  },
  {
    id: "answers",
    label: "Missing answers",
    status: "needs_input",
    hint: "A required question couldn't be answered from your profile or saved answers. Open one to answer; once nothing is missing it moves to Ready to approve, and short answers fill in on other forms.",
    empty: "No questions waiting on you.",
  },
] as const satisfies readonly { id: string; label: string; status: AppStatus; hint: string; empty: string }[];

type TabId = (typeof TABS)[number]["id"];

/** Short label per flag kind (see the application page for the full text). */
const FLAG_LABEL: Record<string, string> = { ai_restriction: "Restricts AI", ai_directed_text: "Text aimed at AI" };
const FLAG_HINT: Record<string, string> = {
  ai_restriction: "The employer limits AI use in applications, so free-text answers were left for you.",
  ai_directed_text: "The page has instructions written for AI tools (often hidden); they were ignored.",
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** One line on what an application needs from you, per lane. */
function Needs({ tab, app }: { tab: TabId; app: ApplicationWithDetails }) {
  if (tab === "answers") {
    const qs = blockingQuestions(app);
    return (
      <span>
        <span className="font-medium text-warning">{qs.length} required question{qs.length === 1 ? "" : "s"}</span>
        <span className="block truncate text-muted-foreground" title={qs.map((q) => q.question).join("\n")}>
          {qs.map((q) => q.question).join(" · ")}
        </span>
      </span>
    );
  }
  const toCheck = app.questions.filter((q) => q.bucket === "drafted" || q.needs_check).length;
  const kinds = [...new Set(((app.flags as { kind: string }[] | null) ?? []).map((f) => f.kind))];
  if (!toCheck && !kinds.length) return <span className="text-muted-foreground">All answers filled</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {toCheck > 0 && <Badge className={TONE_BADGE.info}>{toCheck} to double-check</Badge>}
      {kinds.map((k) => <Badge key={k} className={TONE_BADGE.warning} title={FLAG_HINT[k]}>{FLAG_LABEL[k] ?? k}</Badge>)}
    </span>
  );
}

async function Todo({ searchParams }: { searchParams: SearchParams }) {
  const { db, owner } = await ownerContext();
  const [apps, params] = await Promise.all([listApplications(db, owner.id, TABS.map((t) => t.status)), searchParams]);
  const byTab = Object.fromEntries(TABS.map((t) => [t.id, apps.filter((a) => a.status === t.status)])) as Record<TabId, ApplicationWithDetails[]>;
  // Without a tab in the URL, open the first lane that has something in it.
  const asked = TABS.find((t) => t.id === one(params.tab));
  const current = asked ?? TABS.find((t) => byTab[t.id].length > 0) ?? TABS[0];
  const rows = byTab[current.id];
  const now = new Date();

  return (
    <>
      <nav className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1" aria-label="To do lanes">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/app/todo?tab=${t.id}`}
            aria-current={current.id === t.id ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              current.id === t.id && "bg-background text-foreground shadow-sm",
            )}
          >
            {t.label}
            <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{byTab[t.id].length}</span>
          </Link>
        ))}
      </nav>

      <Card className={scrollingTable.card}>
        <CardHeader>
          <CardDescription>{current.hint}</CardDescription>
        </CardHeader>
        <CardContent className={scrollingTable.content}>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{current.empty}</p>
          ) : (
            <Table containerClassName={scrollingTable.container}>
              <TableHeader className={scrollingTable.header}>
                <TableRow>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>{current.id === "ready" ? "To look at" : "What it needs"}</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Prepared</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-right align-top"><Badge className="tabular-nums">{a.score ?? "—"}</Badge></TableCell>
                    <TableCell className="max-w-xs whitespace-normal align-top">
                      <Link href={`/app/applications/${a.id}`} className="font-medium hover:underline">{a.job.title}</Link>
                      <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                        {a.job.company_name}{a.job.location ? ` · ${a.job.location}` : ""}
                        <SiteBadge source={a.job.source} />
                      </div>
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal align-top text-sm"><Needs tab={current.id} app={a} /></TableCell>
                    <TableCell className="align-top tabular-nums">{formatSalary(a.job.salary_min, a.job.salary_max, a.job.salary_currency) || "—"}</TableCell>
                    <TableCell className="align-top text-muted-foreground">{a.prepared_at ? ago(a.prepared_at, now) : "—"}</TableCell>
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

/** To do: applications waiting on you before approval, one row per application, in two lanes. Stuck ones are on the board. */
export default function TodoPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-col gap-6 md:h-full">
      <h1 className="text-2xl font-semibold tracking-tight">To do</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Todo searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
