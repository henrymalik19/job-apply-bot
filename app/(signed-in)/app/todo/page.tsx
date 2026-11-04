import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ownerContext } from "@/server/auth/require-owner";
import type { AppStatus } from "@/server/modules/applications/application-status";
import { blockingQuestions, listApplications, runnerHandedBack, yourSteps, type ApplicationWithDetails } from "@/server/modules/applications/applications.service";
import { matchEmail } from "@/server/modules/tracking/classify";
import { listUnmatchedEmails, listUnsortedEmails, type UnmatchedEmail } from "@/server/modules/tracking/tracking.service";
import { cn } from "@/shared/cn";
import { ago, formatSalary } from "@/shared/format";
import { scrollingTable } from "../../_components/data-table";
import { LiveRefresh } from "../../_components/live-refresh";
import { SiteBadge } from "../../_components/site-badge";
import { TONE_BADGE } from "../../_components/status";
import { LinkEmail, type LinkTarget } from "./link-email";
import { TableSkeleton } from "../../_components/skeletons";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The two lanes waiting on you before approval, by the statuses each holds (ids match todoHref).
 * Ready to approve includes forms preparing found can't be filled automatically.
 */
const TABS = [
  {
    id: "ready",
    label: "Ready to approve",
    statuses: ["queued", "manual"],
    hint: "Every required question is answered, or the form can't be filled automatically (approve those to wait for the apply runner, or apply yourself). Open one to check it, then approve or skip.",
    empty: "Nothing to approve. New applications are prepared after each matching run.",
  },
  {
    id: "answers",
    label: "Missing answers",
    statuses: ["needs_input"],
    hint: "A required question couldn't be answered from your profile or saved answers. Open one to answer; once nothing is missing it moves to Ready to approve, and short answers fill in on other forms.",
    empty: "No questions waiting on you.",
  },
] as const satisfies readonly { id: string; label: string; statuses: readonly AppStatus[]; hint: string; empty: string }[];

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
  const steps = yourSteps(app);
  if (app.status === "manual" && steps.length === 0) {
    const reason = app.prepare_error;
    return (
      <span>
        <Badge className={TONE_BADGE.warning}>Can&apos;t fill automatically</Badge>
        {reason && <span className="mt-1 block truncate text-muted-foreground" title={reason}>{reason}</span>}
      </span>
    );
  }
  const toCheck = app.questions.filter((q) => q.bucket === "drafted" || q.needs_check).length;
  const kinds = [...new Set(((app.flags as { kind: string }[] | null) ?? []).map((f) => f.kind))];
  if (!toCheck && !kinds.length && !steps.length) return <span className="text-muted-foreground">All answers filled</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {steps.length > 0 && (
        <Badge className={TONE_BADGE.warning} title={`The runner fills the rest and leaves this to you in Chrome:\n${steps.map((q) => q.question).join("\n")}`}>
          {steps.length === 1 ? "1 step" : `${steps.length} steps`} for you in Chrome
        </Badge>
      )}
      {toCheck > 0 && <Badge className={TONE_BADGE.info}>{toCheck} to double-check</Badge>}
      {kinds.map((k) => <Badge key={k} className={TONE_BADGE.warning} title={FLAG_HINT[k]}>{FLAG_LABEL[k] ?? k}</Badge>)}
    </span>
  );
}

/** What an email says, for the Unmatched emails tab. */
const EMAIL_KIND_LABEL: Record<string, string> = {
  confirmation: "Confirmation",
  rejection: "Rejection",
  interview: "Interview",
  recruiter: "Recruiter reply",
};

/** Emails tracking couldn't tie to one application, or couldn't sort: pick it, and it moves as if matched. */
function UnmatchedEmails({ emails, unsorted, apps, now }: { emails: UnmatchedEmail[]; unsorted: UnmatchedEmail[]; apps: ApplicationWithDetails[]; now: Date }) {
  const targets: LinkTarget[] = apps.map((a) => ({ id: a.id, label: `${a.job.company_name}: ${a.job.title}` }));
  const tracked = apps.map((a) => ({ id: a.id, status: a.status, company: a.job.company_name, title: a.job.title, submittedAt: a.submitted_at }));
  return (
    <Card className={scrollingTable.card}>
      <CardHeader>
        <CardDescription>
          Replies in the job inbox that would move an application, but name a company you applied to more than once, or none
          tracking could find. Pick the application and it moves as if matched (a rejection to Closed, an interview to
          Interviewing); dismiss one that isn&apos;t about an application.
        </CardDescription>
      </CardHeader>
      <CardContent className={scrollingTable.content}>
        {unsorted.length > 0 && (
          <div className="mb-6 flex flex-col gap-2">
            <h2 className="text-sm font-medium">Couldn&apos;t tell what it says</h2>
            <p className="text-sm text-muted-foreground">
              From an applicant system or a company you applied to, but no rule recognized the wording. Pick what it says
              and the application; it moves as if tracking had caught it.
            </p>
            <Table>
              <TableBody>
                {unsorted.map((e) => {
                  const guess = matchEmail({ fromAddress: e.from, fromName: e.from, subject: e.subject, text: e.snippet, receivedAt: new Date(e.receivedAt) }, tracked);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="max-w-md whitespace-normal align-top">
                        <span className="font-medium">{e.subject || "(no subject)"}</span>
                        <span className="block text-sm text-muted-foreground">{e.from}</span>
                        <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground" title={e.snippet}>{e.snippet}</span>
                      </TableCell>
                      <TableCell className="align-top"><LinkEmail emailId={e.id} targets={targets} suggested={guess.app?.id ?? null} askKind /></TableCell>
                      <TableCell className="align-top text-muted-foreground">{ago(e.receivedAt, now)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {emails.length === 0 ? (
          unsorted.length === 0 && <p className="text-sm text-muted-foreground">No emails waiting to be linked.</p>
        ) : (
          <Table containerClassName={scrollingTable.container}>
            <TableHeader className={scrollingTable.header}>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Says</TableHead>
                <TableHead>Application</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.map((e) => {
                const guess = matchEmail({ fromAddress: e.from, fromName: e.from, subject: e.subject, text: e.snippet, receivedAt: new Date(e.receivedAt) }, tracked);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="max-w-md whitespace-normal align-top">
                      <span className="font-medium">{e.subject || "(no subject)"}</span>
                      <span className="block text-sm text-muted-foreground">{e.from}</span>
                      <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground" title={e.snippet}>{e.snippet}</span>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge className={e.kind === "rejection" ? TONE_BADGE.muted : e.kind === "confirmation" ? TONE_BADGE.info : TONE_BADGE.success}>
                        {EMAIL_KIND_LABEL[e.kind] ?? e.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top"><LinkEmail emailId={e.id} targets={targets} suggested={guess.app?.id ?? null} /></TableCell>
                    <TableCell className="align-top text-muted-foreground">{ago(e.receivedAt, now)}</TableCell>
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

async function Todo({ searchParams }: { searchParams: SearchParams }) {
  const { db, owner } = await ownerContext();
  const [listed, params, emails, applied] = await Promise.all([
    listApplications(db, owner.id, TABS.flatMap((t) => t.statuses)),
    searchParams,
    listUnmatchedEmails(db, owner.id),
    listApplications(db, owner.id, ["approved", "manual", "submitted", "confirmed", "responded", "interviewing", "offer"]),
  ]);
  const unsorted = await listUnsortedEmails(
    db,
    owner.id,
    applied.map((a) => ({ id: a.id, status: a.status, company: a.job.company_name, title: a.job.title, submittedAt: a.submitted_at })),
  );
  const waiting = emails.length + unsorted.length;
  // Ones the apply runner handed back are on the board (Runner stuck).
  const apps = listed.filter((a) => !runnerHandedBack(a));
  const byTab = Object.fromEntries(TABS.map((t) => [t.id, apps.filter((a) => (t.statuses as readonly string[]).includes(a.status))])) as Record<TabId, ApplicationWithDetails[]>;
  // Without a tab in the URL, open the first lane that has something in it.
  const asked = TABS.find((t) => t.id === one(params.tab));
  const showEmails = one(params.tab) === "emails" || (!asked && TABS.every((t) => byTab[t.id].length === 0) && waiting > 0);
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
            aria-current={!showEmails && current.id === t.id ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              !showEmails && current.id === t.id && "bg-background text-foreground shadow-sm",
            )}
          >
            {t.label}
            <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{byTab[t.id].length}</span>
          </Link>
        ))}
        <Link
          href="/app/todo?tab=emails"
          aria-current={showEmails ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            showEmails && "bg-background text-foreground shadow-sm",
          )}
        >
          Unmatched emails
          <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{waiting}</span>
        </Link>
      </nav>

      {showEmails ? <UnmatchedEmails emails={emails} unsorted={unsorted} apps={applied} now={now} /> : (

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
      )}
    </>
  );
}

/** To do: applications waiting on you before approval, one row per application, in two lanes. Stuck ones are on the board. */
export default function TodoPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-col gap-6 md:h-full">
      <LiveRefresh />
      <h1 className="text-2xl font-semibold tracking-tight">To do</h1>
      <Suspense fallback={<TableSkeleton tabs={3} />}>
        <Todo searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
