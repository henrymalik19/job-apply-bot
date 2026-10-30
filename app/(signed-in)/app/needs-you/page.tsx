import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ownerContext } from "@/server/auth/require-owner";
import { blockingQuestions, listApplications } from "@/server/modules/applications/applications.service";
import { QuestionForm } from "../applications/question-form";

async function NeedsYou() {
  const { db, owner } = await ownerContext();
  const [blocked, manual] = await Promise.all([listApplications(db, owner.id, ["needs_input"]), listApplications(db, owner.id, ["manual"])]);
  const questionCount = blocked.reduce((n, a) => n + blockingQuestions(a).length, 0);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{questionCount} question{questionCount === 1 ? "" : "s"} to answer</CardTitle>
          <CardDescription>
            Required questions the system couldn&apos;t answer from your profile or saved answers. &ldquo;Save for next time&rdquo;
            stores the answer so the same question fills in automatically on later forms. When an application has nothing
            left, it moves to Review.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {blocked.length === 0 && <p className="text-sm text-muted-foreground">Nothing is waiting on you.</p>}
          {blocked.map((a) => (
            <div key={a.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <Link href={`/app/applications/${a.id}`} className="font-medium hover:underline">{a.job.title}</Link>
                <span className="text-muted-foreground">{a.job.company_name}</span>
                {a.score != null && <Badge className="tabular-nums">{a.score}</Badge>}
              </div>
              <div className="divide-y">
                {blockingQuestions(a).map((q) => <QuestionForm key={q.id} q={q} applicationId={a.id} saveByDefault />)}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{manual.length} to apply yourself</CardTitle>
          <CardDescription>
            Forms the system can&apos;t fill (no public form data, assessments, portals). Each has a tailored resume and the
            answers it could prepare.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {manual.length === 0 && <p className="text-sm text-muted-foreground">None right now.</p>}
          {manual.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link href={`/app/applications/${a.id}`} className="font-medium hover:underline">{a.job.title}</Link>
              <span className="text-muted-foreground">{a.job.company_name}</span>
              {a.prepare_error && <span className="text-sm text-muted-foreground">({a.prepare_error})</span>}
              <a href={a.job.apply_url ?? a.job.url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                <ExternalLink /> Apply
              </a>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

/** Needs you: questions only you can answer, and applications to submit yourself. */
export default function NeedsYouPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Needs you</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <NeedsYou />
      </Suspense>
    </main>
  );
}
