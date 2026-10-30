import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ownerContext } from "@/server/auth/require-owner";
import { blockingQuestions, getApplication, type ApplicationWithDetails } from "@/server/modules/applications/applications.service";
import { getJobMatch } from "@/server/modules/matching/matching.service";
import { getApplicationResume, signedPdfUrl, type Resume, type ResumeDoc } from "@/server/modules/resumes/resumes.service";
import { ago, formatSalary } from "@/shared/format";
import { ActionForm } from "../../../_components/action-form";
import { MatchCard } from "../../../_components/match-card";
import { approveAction, skipAction } from "../actions";
import { QuestionForm } from "../question-form";

type Params = Promise<{ id: string }>;
type Flag = { kind: string; excerpt: string; where: string; hidden?: boolean };

const STATUS_LABEL: Record<string, string> = {
  queued: "Ready to review",
  needs_input: "Needs you",
  manual: "Apply yourself",
  approved: "Approved",
  skipped: "Skipped",
  failed: "Preparing failed",
};

function Flags({ flags }: { flags: Flag[] }) {
  if (flags.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {flags.map((f, i) => (
        <Alert key={i} variant={f.kind === "ai_directed_text" ? "destructive" : "default"}>
          <AlertTitle>
            {f.kind === "ai_restriction"
              ? "The employer restricts AI use"
              : `Text aimed at AI tools${f.hidden ? " (hidden from human readers)" : ""}`}
          </AlertTitle>
          <AlertDescription>
            <p>&ldquo;{f.excerpt}&rdquo;</p>
            <p className="mt-1 text-xs">
              {f.kind === "ai_restriction"
                ? "Free-text answers were left for you to write."
                : "Not followed: drafts never see hidden text. Shown here so you know it's there."}
              {f.where !== "posting" && ` Found in question ${f.where}.`}
            </p>
          </AlertDescription>
        </Alert>
      ))}
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
          <Badge variant={resume.kind === "tailored" ? "default" : "secondary"}>{resume.kind === "tailored" ? "tailored" : "untailored"}</Badge>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <FileText /> Open PDF
            </a>
          )}
        </CardTitle>
        {problems.length > 0 && (
          <CardDescription>Tailoring didn&apos;t pass the fact guard, so this is your untailored resume: {problems.join("; ")}.</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {doc.summary && <p>{doc.summary}</p>}
        {doc.experience.map((j) => (
          <div key={j.employment_id}>
            <div className="font-medium">{j.title}, {j.employer} <span className="font-normal text-muted-foreground">· {j.dates}</span></div>
            <ul className="list-disc pl-5 text-muted-foreground">{j.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
          </div>
        ))}
        {doc.skills.length > 0 && <p className="text-muted-foreground">Skills: {doc.skills.join(", ")}</p>}
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
              ? "This form can't be filled automatically. Apply on the employer's site using the resume and answers here."
              : "Answer every required question above and it moves to Review."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {app.status === "queued" && (
          <ActionForm action={approveAction} submitLabel="Approve">
            <input type="hidden" name="application_id" value={app.id} />
          </ActionForm>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-medium">Skip this job</summary>
          <ActionForm action={skipAction} submitLabel="Skip" className="mt-3">
            <input type="hidden" name="application_id" value={app.id} />
            <input type="hidden" name="back" value={back} />
            <Input name="reason" placeholder="Why (optional), e.g. too much on-call" className="max-w-xl" />
            <div className="flex flex-wrap items-center gap-3">
              <Input name="lesson" placeholder="Save as a lesson (optional), e.g. Skip roles with heavy on-call" className="max-w-xl flex-1" />
              <NativeSelect name="lesson_scope" defaultValue="scoring" aria-label="Lesson applies to">
                <NativeSelectOption value="scoring">for scoring</NativeSelectOption>
                <NativeSelectOption value="tailoring">for resumes</NativeSelectOption>
                <NativeSelectOption value="answers">for answers</NativeSelectOption>
                <NativeSelectOption value="global">everywhere</NativeSelectOption>
              </NativeSelect>
            </div>
          </ActionForm>
        </details>
      </CardContent>
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{app.job.title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <span className="font-medium text-foreground">{app.job.company_name}</span>
          {app.job.location && <span>{app.job.location}</span>}
          {salary && <span className="tabular-nums">{salary}</span>}
          {app.job.posted_at && <span>posted {ago(app.job.posted_at, now)}</span>}
          <Badge>{STATUS_LABEL[app.status] ?? app.status}</Badge>
          {app.job.closed_at && <Badge variant="outline">Posting closed</Badge>}
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
        {app.prepare_error && <p className="text-sm text-destructive">{app.prepare_error}</p>}
      </div>

      <Flags flags={flags} />

      <div className="grid gap-6 xl:grid-cols-2">
        <MatchCard match={match} />
        <ResumeCard resume={resume} url={url} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Questions</CardTitle>
          <CardDescription>
            {app.questions.length} on the form
            {blockers.length > 0 ? ` · ${blockers.length} required still need you` : " · nothing required is missing"}.
            {app.status === "queued" && " Answers marked “please check” came from a wording seen for the first time."}
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {app.questions.length === 0 && <p className="text-sm text-muted-foreground">No form questions were found.</p>}
          {app.questions.map((q) =>
            editable ? (
              <QuestionForm key={q.id} q={q} applicationId={app.id} saveByDefault={q.bucket === "needs_user"} />
            ) : (
              <div key={q.id} className="py-3 text-sm"><span className="font-medium">{q.question}</span>: {q.answer ?? "—"}</div>
            ),
          )}
        </CardContent>
      </Card>

      {editable && <Decide app={app} />}
    </div>
  );
}

/** One application: job, score, flags, tailored resume and every form question, with approve and skip. */
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
