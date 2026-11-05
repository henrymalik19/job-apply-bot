import { ArrowLeft, ChevronRight, ExternalLink, FileText, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ownerContext } from "@/server/auth/require-owner";
import {
  blockingQuestions,
  getApplication,
  yourSteps,
  type ApplicationQuestion,
  type ApplicationWithDetails,
} from "@/server/modules/applications/applications.service";
import { canRetry } from "@/server/modules/apply/apply.service";
import { countApplyRuns } from "@/server/modules/apply/apply-runs";
import { getJobMatch } from "@/server/modules/matching/matching.service";
import { getApplicationResume, signedPdfUrl, type Resume, type ResumeDoc } from "@/server/modules/resumes/resumes.service";
import { cn } from "@/shared/cn";
import { ago, formatSalary } from "@/shared/format";
import { MatchCard } from "../../../_components/match-card";
import { runnerFills, SiteBadge } from "../../../_components/site-badge";
import { LiveRefresh } from "../../../_components/live-refresh";
import { APPLY_STEP_TITLE, backLink, statusInfo, todoHref, TONE_BADGE, type Tone } from "../../../_components/status";
import { DecideActions, MarkAppliedButton, RetryApplyButton } from "../decide-actions";
import { QuestionForm } from "../question-form";
import { AnswersForm } from "../answers-form";
import { EmailsCard } from "../emails-card";
import { listApplicationEmails } from "@/server/modules/tracking/tracking.service";
import { DetailSkeleton } from "../../../_components/skeletons";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Flag = { kind: string; excerpt: string; where: string; hidden?: boolean };

/** Colored box per tone for the "next step" callout. */
const TONE_BOX: Record<Tone, string> = {
  warning: "border-warning/40 bg-warning/10",
  info: "border-info/40 bg-info/10",
  success: "border-success/40 bg-success/10",
  muted: "border-border bg-muted/40",
  destructive: "border-destructive/40 bg-destructive/10",
};

/** The required steps the runner leaves for you in Chrome, each linked to its question. */
function YourSteps({ steps }: { steps: ApplicationQuestion[] }) {
  return (
    <>
      <p className="mt-1">
        Once you approve, the apply runner fills everything else and leaves {steps.length === 1 ? "this" : "these"} for you in
        the Chrome window, then waits up to an hour for you to click Submit:
      </p>
      <ul className="list-disc pl-5">
        {steps.map((q) => (
          <li key={q.id}>
            <a href={`#q-${q.id}`} className="underline underline-offset-2">{q.question}</a>
            {q.reason && <span className="text-muted-foreground">: {q.reason}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

/** What to do next with this application, in one colored box at the top. */
function NextStep({ app, blockers, flags }: { app: ApplicationWithDetails; blockers: ApplicationQuestion[]; flags: Flag[] }) {
  const info = statusInfo(app.status);
  const toCheck = app.questions.filter((q) => q.bucket === "drafted" || q.needs_check).length;
  let title: string;
  let body: React.ReactNode;
  if (app.status === "needs_input") {
    title = `${blockers.length} required ${blockers.length === 1 ? "question needs" : "questions need"} your answer`;
    body = (
      <ul className="list-disc pl-5">
        {blockers.map((q) => (
          <li key={q.id}><a href={`#q-${q.id}`} className="underline underline-offset-2">{q.question}</a></li>
        ))}
      </ul>
    );
  } else if (app.status === "manual" && app.apply_note == null) {
    // Prepare couldn't read this site's form. (Older applications landed here for steps only you can do;
    // approving those works like Ready to approve.)
    const steps = yourSteps(app);
    title = steps.length ? "Ready to approve, with a step for you" : "Can't be filled automatically";
    body = (
      <>
        {steps.length ? (
          <YourSteps steps={steps} />
        ) : (
          <p>
            {app.prepare_error ?? "The apply runner can't read this site's form."} Approve it to wait in Approved until the
            runner supports this site, or apply on the employer&apos;s site yourself. The resume and answers below are ready to copy.
          </p>
        )}
        {(app.job.apply_url ?? app.job.url) && (
          <a href={app.job.apply_url ?? app.job.url} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "sm" }), "mt-2")}>
            <ExternalLink /> Open the application form
          </a>
        )}
        <div className="mt-2 flex flex-wrap items-start gap-2">
          <MarkAppliedButton applicationId={app.id} />
        </div>
      </>
    );
  } else if (app.status === "manual") {
    title = "Apply on the employer's site";
    body = (
      <>
        <p>{app.apply_note ?? app.prepare_error ?? "This form can't be filled automatically."} The resume and answers below are ready to copy.</p>
        {(app.job.apply_url ?? app.job.url) && (
          <a href={app.job.apply_url ?? app.job.url} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "sm" }), "mt-2")}>
            <ExternalLink /> Open the application form
          </a>
        )}
        <div className="mt-2 flex flex-wrap items-start gap-2">
          <MarkAppliedButton applicationId={app.id} />
          {canRetry(app.job.source, app.apply_note) && <RetryApplyButton applicationId={app.id} />}
        </div>
      </>
    );
  } else if (app.status === "approved" && !runnerFills(app.job.source)) {
    title = "Approved: apply on the employer's site";
    body = (
      <>
        <p>The apply runner can&apos;t fill this site yet. The resume and answers below are ready to copy.</p>
        {(app.job.apply_url ?? app.job.url) && (
          <a href={app.job.apply_url ?? app.job.url} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "sm" }), "mt-2")}>
            <ExternalLink /> Open the application form
          </a>
        )}
        <MarkAppliedButton applicationId={app.id} className="mt-2" />
      </>
    );
  } else if (app.status === "approved") {
    title = app.apply_step ? APPLY_STEP_TITLE[app.apply_step] : "Approved, waiting for the apply runner";
    body = app.apply_step ? (
      <p>{app.apply_note}</p>
    ) : (
      <p>
        The apply runner on your computer fills the form in Chrome and waits for you to click Submit. Start it with{" "}
        <code className="rounded bg-muted px-1">pnpm worker:apply</code>; it picks this up within 20 seconds.
        {app.apply_note && <span className="mt-1 block text-muted-foreground">{app.apply_note}</span>}
      </p>
    );
  } else if (app.status === "queued") {
    title = "Ready to review";
    body = (
      <p>
        Everything required is answered.
        {toCheck > 0 ? ` Look over the ${toCheck} ${toCheck === 1 ? "answer" : "answers"} under “Double-check these” and the resume,` : " Look over the resume,"} then
        approve or skip on the right.
      </p>
    );
    if (yourSteps(app).length > 0) body = <>{body}<YourSteps steps={yourSteps(app)} /></>;
  } else {
    title = info.label;
    body = <p>{info.hint}</p>;
  }
  return (
    <div className={cn("rounded-lg border p-4 text-sm", TONE_BOX[info.tone])}>
      <div className="mb-1 font-semibold">{title}</div>
      {body}
      {flags.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 border-t border-current/10 pt-3">
          {flags.map((f, i) => (
            <div key={i} className="flex gap-2">
              <TriangleAlert className={cn("mt-0.5 size-4 shrink-0", f.kind === "ai_directed_text" ? "text-destructive" : "text-warning")} />
              <p>
                <span className="font-medium">
                  {f.kind === "ai_restriction" ? "The employer restricts AI use" : `Text aimed at AI tools${f.hidden ? ", hidden from human readers" : ""}`}
                  {f.where !== "posting" && ` (in question ${f.where})`}:
                </span>{" "}
                &ldquo;{f.excerpt}&rdquo;{" "}
                <span className="text-muted-foreground">
                  {f.kind === "ai_restriction"
                    ? "Free-text answers weren't drafted automatically; you can still draft one with AI."
                    : "It was ignored; drafts never see hidden text."}
                </span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResumeCard({ resume, url }: { resume: Resume | null; url: string | null }) {
  if (!resume) return <p className="text-sm text-muted-foreground">No resume was prepared for this application.</p>;
  const doc = resume.content as unknown as ResumeDoc;
  const problems = (resume.guard_problems as string[]) ?? [];
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Resume
          <Badge className={resume.kind === "tailored" ? TONE_BADGE.success : TONE_BADGE.muted}>
            {resume.kind === "tailored" ? "tailored" : "untailored"}
          </Badge>
        </CardTitle>
        {problems.length > 0 && (
          <CardDescription>Tailoring didn&apos;t pass the fact guard, so this is your untailored resume: {problems.join("; ")}.</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")}>
            <FileText /> Open PDF
          </a>
        )}
        {doc.summary && <p className="text-muted-foreground">{doc.summary}</p>}
        <details>
          <summary className="cursor-pointer font-medium">Experience and skills</summary>
          <div className="mt-3 flex flex-col gap-3">
            {doc.experience.map((j) => (
              <div key={j.employment_id}>
                <div className="font-medium">{j.title}, {j.employer} <span className="font-normal text-muted-foreground">· {j.dates}</span></div>
                <ul className="list-disc pl-5 text-muted-foreground">{j.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
              </div>
            ))}
            {doc.skills.length > 0 && <p className="text-muted-foreground">Skills: {doc.skills.join(", ")}</p>}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function Decide({ app }: { app: ApplicationWithDetails }) {
  const back = todoHref(app.status, app.apply_note);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Decide</CardTitle>
        <CardDescription>
          {app.status === "queued"
            ? "Approving moves it to your to-submit list; you still submit it yourself."
            : app.status === "manual" && app.apply_note == null
              ? "Approving moves it to Approved, where it waits for the apply runner; or apply yourself and click I applied above."
              : app.status === "manual"
              ? "Once you've applied on the employer's site, click I applied above; if you decided not to, skip it here."
              : "Approve unlocks once every required question is answered."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DecideActions applicationId={app.id} company={app.job.company_name} canApprove={app.status === "queued" || (app.status === "manual" && app.apply_note == null)} back={back} />
      </CardContent>
    </Card>
  );
}

/** One group of questions; `collapsible` puts it behind a summary line you can open and close. */
function QuestionGroup(props: {
  title: string;
  hint: string;
  questions: ApplicationQuestion[];
  app: ApplicationWithDetails;
  editable: boolean;
  aiAllowed: (q: ApplicationQuestion) => boolean;
  tone?: Tone;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** The group's one Save button. */
  saveLabel?: string;
}) {
  const { title, hint, questions, app, editable, aiAllowed, tone, collapsible = false, defaultOpen = false, saveLabel = "Save answers" } = props;
  if (questions.length === 0) return null;
  const list = (
    <div className="divide-y">
      {questions.map((q) =>
        editable ? (
          <div key={q.id} id={`q-${q.id}`} className="scroll-mt-40">
            <QuestionForm q={q} showBucket={false} aiAllowed={aiAllowed(q)} />
          </div>
        ) : (
          <div key={q.id} className="py-3 text-sm"><span className="font-medium">{q.question}</span>: {q.answer ?? "—"}</div>
        ),
      )}
    </div>
  );
  const body = editable ? <AnswersForm applicationId={app.id} saveLabel={saveLabel}>{list}</AnswersForm> : list;
  const heading = (
    <span className="flex items-center gap-2">
      <span className="font-semibold">{title}</span>
      <Badge className={tone ? TONE_BADGE[tone] : TONE_BADGE.muted}>{questions.length}</Badge>
    </span>
  );
  return (
    <Card>
      {collapsible ? (
        <CardContent>
          <details className="group" open={defaultOpen}>
            <summary className="flex cursor-pointer list-none items-start gap-2 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="mt-0.5 size-4 shrink-0 transition-transform group-open:rotate-90" />
              <span className="flex flex-col">
                {heading}
                <span className="text-sm text-muted-foreground">{hint}</span>
              </span>
            </summary>
            <div className="mt-2">{body}</div>
          </details>
        </CardContent>
      ) : (
        <>
          <CardHeader>
            <CardTitle>{heading}</CardTitle>
            <CardDescription>{hint}</CardDescription>
          </CardHeader>
          <CardContent>{body}</CardContent>
        </>
      )}
    </Card>
  );
}

async function ApplicationDetail({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { db, owner } = await ownerContext();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const app = await getApplication(db, owner.id, id);
  if (!app) notFound();
  const [match, resume, runs, emails] = await Promise.all([
    getJobMatch(db, owner.id, app.job.id),
    getApplicationResume(db, app.id),
    countApplyRuns(db, app.id),
    listApplicationEmails(db, owner.id, app.id),
  ]);
  const url = resume?.pdf_path ? await signedPdfUrl(db, resume.pdf_path).catch(() => null) : null;
  const now = new Date();
  const blockers = blockingQuestions(app);
  const flags = (app.flags as Flag[]) ?? [];
  const salary = formatSalary(app.job.salary_min, app.job.salary_max, app.job.salary_currency);
  const editable = app.status === "queued" || app.status === "needs_input" || app.status === "manual";
  // An approved application still takes answers to its open questions, for the runner to use, while it isn't filling the form.
  const answerable = editable || (app.status === "approved" && !app.apply_step);
  const aiAllowed = (q: ApplicationQuestion) =>
    !flags.some((f) => f.kind === "ai_restriction" && (f.where === "posting" || f.where === q.field_name));
  const info = statusInfo(app.status);

  const yours = app.questions.filter((q) => q.bucket === "needs_user" || q.bucket === "cannot_automate");
  const optional = yours.filter((q) => !q.required);
  const toCheck = app.questions.filter((q) => !yours.includes(q) && (q.bucket === "drafted" || q.needs_check));
  const filled = app.questions.filter((q) => !yours.includes(q) && !toCheck.includes(q));

  const back = backLink(app.status, app.apply_note, typeof query.from === "string" ? query.from : undefined);
  return (
    <div className="flex flex-col gap-6">
      {/* While approved the apply runner may be filling it; other states have answer boxes a refresh could disturb. */}
      {app.status === "approved" && <LiveRefresh everyMs={5000} />}
      <Link href={back.href} className={`${buttonVariants({ variant: "ghost", size: "sm" })} -mb-2 self-start`}>
        <ArrowLeft /> {back.label}
      </Link>
      {/* Stays at the top while the questions scroll; the negative margins cover the page padding. */}
      <header className="sticky -top-8 z-10 -mx-4 -mt-4 flex flex-wrap items-end justify-between gap-3 border-b bg-background px-4 pt-4 pb-3 md:-mx-8 md:px-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={TONE_BADGE[info.tone]}>{info.label}</Badge>
            <SiteBadge source={app.job.source} />
            {app.job.closed_at && <Badge variant="outline">Posting closed</Badge>}
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{app.job.title}</h1>
          <p className="text-sm text-muted-foreground">
            {[app.job.company_name, app.job.location, salary, app.job.posted_at ? `posted ${ago(app.job.posted_at, now)}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={app.job.url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ExternalLink /> Posting
          </a>
          {app.job.apply_url && app.job.apply_url !== app.job.url && (
            <a href={app.job.apply_url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ExternalLink /> Application form
            </a>
          )}
          <Link href={`/app/jobs/${app.job.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Job details</Link>
        </div>
      </header>

      <NextStep app={app} blockers={blockers} flags={flags} />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {app.questions.length === 0 && (
            <Card><CardContent><p className="text-sm text-muted-foreground">No form questions were found.</p></CardContent></Card>
          )}
          <QuestionGroup
            title="Needs your answer"
            hint="Required, and couldn't be answered from your profile or saved answers. Short answers you give here are remembered, so other applications fill them in automatically."
            questions={yours.filter((q) => q.required && q.bucket === "needs_user")}
            app={app}
            editable={answerable}
            aiAllowed={aiAllowed}
            tone="warning"
          />
          <QuestionGroup
            title="For you in Chrome"
            hint="Steps only you can do, like an assessment or a file to attach. The apply runner fills everything else, then leaves these to you in the Chrome window before you click Submit."
            questions={yours.filter((q) => q.required && q.bucket === "cannot_automate")}
            app={app}
            editable={false}
            aiAllowed={aiAllowed}
            tone="info"
          />
          <QuestionGroup
            title="Optional, no answer yet"
            hint="Not required: the application goes through without these. Answer any you'd like included; short answers are remembered for other forms."
            questions={optional}
            app={app}
            editable={editable}
            aiAllowed={aiAllowed}
            tone="muted"
            collapsible
          />
          <QuestionGroup
            title="Double-check these"
            hint="Worth a look before you approve: answers written by AI, and saved answers used for a question worded a bit differently than before."
            questions={toCheck}
            app={app}
            editable={editable}
            saveLabel="Save and mark checked"
            aiAllowed={aiAllowed}
            tone="info"
            collapsible
            defaultOpen
          />
          <QuestionGroup
            title="Filled automatically"
            hint="From your profile, criteria and saved answers. Open to see or change them."
            questions={filled}
            app={app}
            editable={editable}
            aiAllowed={aiAllowed}
            tone="success"
            collapsible
          />
          <EmailsCard emails={emails} now={now} />
        </div>
        <aside className="flex flex-col gap-6 lg:sticky lg:top-32">
          {editable && <Decide app={app} />}
          <MatchCard match={match} stacked showThreshold={false} />
          <ResumeCard resume={resume} url={url} />
          {runs > 0 && (
            <Link href={`/admin/runs?application=${app.id}`} className="self-start text-xs text-muted-foreground hover:text-foreground hover:underline">
              Runner log ({runs} {runs === 1 ? "attempt" : "attempts"})
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}

/** One application: what to do next, its questions by who has to act, and the decision, match and resume alongside. */
export default function ApplicationPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <main className="flex flex-col gap-4">
      <Suspense fallback={<DetailSkeleton />}>
        <ApplicationDetail params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
