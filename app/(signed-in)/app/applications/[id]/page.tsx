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
  type ApplicationQuestion,
  type ApplicationWithDetails,
} from "@/server/modules/applications/applications.service";
import { getJobMatch } from "@/server/modules/matching/matching.service";
import { getApplicationResume, signedPdfUrl, type Resume, type ResumeDoc } from "@/server/modules/resumes/resumes.service";
import { cn } from "@/shared/cn";
import { ago, formatSalary } from "@/shared/format";
import { MatchCard } from "../../../_components/match-card";
import { runnerFills, SiteBadge } from "../../../_components/site-badge";
import { statusInfo, TONE_BADGE, type Tone } from "../../../_components/status";
import { DecideActions } from "../decide-actions";
import { QuestionForm } from "../question-form";

type Params = Promise<{ id: string }>;
type Flag = { kind: string; excerpt: string; where: string; hidden?: boolean };

/** Colored box per tone for the "next step" callout. */
const TONE_BOX: Record<Tone, string> = {
  warning: "border-warning/40 bg-warning/10",
  info: "border-info/40 bg-info/10",
  success: "border-success/40 bg-success/10",
  muted: "border-border bg-muted/40",
  destructive: "border-destructive/40 bg-destructive/10",
};

/** Headline while the apply runner works on an approved application. */
const APPLY_STEP_TITLE: Record<string, string> = {
  filling: "Filling the form now",
  waiting_for_you: "Filled: click Submit in Chrome",
  submitting: "Submitting",
};

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
  const back = app.status === "queued" ? "/app/review" : "/app/needs-you";
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Decide</CardTitle>
        <CardDescription>
          {app.status === "queued"
            ? "Approving moves it to your to-submit list; you still submit it yourself."
            : app.status === "manual"
              ? "Once you've applied on the employer's site, or decided not to, skip it here."
              : "Approve unlocks once every required question is answered."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DecideActions applicationId={app.id} canApprove={app.status === "queued"} back={back} />
      </CardContent>
    </Card>
  );
}

/** One group of questions; `collapsed` puts it behind a summary line. */
function QuestionGroup(props: {
  title: string;
  hint: string;
  questions: ApplicationQuestion[];
  app: ApplicationWithDetails;
  editable: boolean;
  aiAllowed: (q: ApplicationQuestion) => boolean;
  tone?: Tone;
  collapsed?: boolean;
}) {
  const { title, hint, questions, app, editable, aiAllowed, tone, collapsed = false } = props;
  if (questions.length === 0) return null;
  const list = (
    <div className="divide-y">
      {questions.map((q) =>
        editable ? (
          <div key={q.id} id={`q-${q.id}`} className="scroll-mt-20">
            <QuestionForm q={q} applicationId={app.id} showBucket={false} aiAllowed={aiAllowed(q)} />
          </div>
        ) : (
          <div key={q.id} className="py-3 text-sm"><span className="font-medium">{q.question}</span>: {q.answer ?? "—"}</div>
        ),
      )}
    </div>
  );
  const heading = (
    <span className="flex items-center gap-2">
      <span className="font-semibold">{title}</span>
      <Badge className={tone ? TONE_BADGE[tone] : TONE_BADGE.muted}>{questions.length}</Badge>
    </span>
  );
  return (
    <Card>
      {collapsed ? (
        <CardContent>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-start gap-2 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="mt-0.5 size-4 shrink-0 transition-transform group-open:rotate-90" />
              <span className="flex flex-col">
                {heading}
                <span className="text-sm text-muted-foreground">{hint}</span>
              </span>
            </summary>
            <div className="mt-2">{list}</div>
          </details>
        </CardContent>
      ) : (
        <>
          <CardHeader>
            <CardTitle>{heading}</CardTitle>
            <CardDescription>{hint}</CardDescription>
          </CardHeader>
          <CardContent>{list}</CardContent>
        </>
      )}
    </Card>
  );
}

async function ApplicationDetail({ params }: { params: Params }) {
  const { db, owner } = await ownerContext();
  const { id } = await params;
  const app = await getApplication(db, owner.id, id);
  if (!app) notFound();
  const [match, resume] = await Promise.all([getJobMatch(db, owner.id, app.job.id), getApplicationResume(db, app.id)]);
  const url = resume?.pdf_path ? await signedPdfUrl(db, resume.pdf_path).catch(() => null) : null;
  const now = new Date();
  const blockers = blockingQuestions(app);
  const flags = (app.flags as Flag[]) ?? [];
  const salary = formatSalary(app.job.salary_min, app.job.salary_max, app.job.salary_currency);
  const editable = app.status === "queued" || app.status === "needs_input" || app.status === "manual";
  const aiAllowed = (q: ApplicationQuestion) =>
    !flags.some((f) => f.kind === "ai_restriction" && (f.where === "posting" || f.where === q.field_name));
  const info = statusInfo(app.status);

  const yours = app.questions.filter((q) => q.bucket === "needs_user" || q.bucket === "cannot_automate");
  const toCheck = app.questions.filter((q) => !yours.includes(q) && (q.bucket === "drafted" || q.needs_check));
  const filled = app.questions.filter((q) => !yours.includes(q) && !toCheck.includes(q));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={TONE_BADGE[info.tone]}>{info.label}</Badge>
          <SiteBadge source={app.job.source} />
          {app.job.closed_at && <Badge variant="outline">Posting closed</Badge>}
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{app.job.title}</h1>
          <p className="text-lg">{app.job.company_name}</p>
          <p className="text-sm text-muted-foreground">
            {[app.job.location, salary, app.job.posted_at ? `posted ${ago(app.job.posted_at, now)}` : null].filter(Boolean).join(" · ")}
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
            hint="Couldn't be answered from your profile or saved answers. Short answers you give here are remembered, so other applications fill them in automatically."
            questions={yours}
            app={app}
            editable={editable}
            aiAllowed={aiAllowed}
            tone="warning"
          />
          <QuestionGroup
            title="Double-check these"
            hint="Worth a look before you approve: answers written by AI, and saved answers used for a question worded a bit differently than before."
            questions={toCheck}
            app={app}
            editable={editable}
            aiAllowed={aiAllowed}
            tone="info"
          />
          <QuestionGroup
            title="Filled automatically"
            hint="From your profile, criteria and saved answers. Open to see or change them."
            questions={filled}
            app={app}
            editable={editable}
            aiAllowed={aiAllowed}
            tone="success"
            collapsed
          />
        </div>
        <aside className="flex flex-col gap-6 lg:sticky lg:top-4">
          {editable && <Decide app={app} />}
          <MatchCard match={match} stacked showThreshold={false} />
          <ResumeCard resume={resume} url={url} />
        </aside>
      </div>
    </div>
  );
}

/** One application: what to do next, its questions by who has to act, and the decision, match and resume alongside. */
export default function ApplicationPage({ params }: { params: Params }) {
  return (
    <main className="flex flex-col gap-4">
      <Link href="/app/review" className={`${buttonVariants({ variant: "ghost", size: "sm" })} self-start`}>
        <ArrowLeft /> Review
      </Link>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <ApplicationDetail params={params} />
      </Suspense>
    </main>
  );
}
