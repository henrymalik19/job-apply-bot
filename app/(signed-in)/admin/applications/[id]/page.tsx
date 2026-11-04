import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminContext } from "@/server/auth/require-owner";
import { displayName, getAnyApplication, getUserProfile } from "@/server/modules/admin/admin.service";
import { countApplyRuns } from "@/server/modules/apply/apply-runs";
import { listApplicationEmails } from "@/server/modules/tracking/tracking.service";
import { ago } from "@/shared/format";
import { DetailSkeleton } from "../../../_components/skeletons";
import { statusInfo, TONE_BADGE } from "../../../_components/status";
import { EmailsCard } from "../../../app/applications/emails-card";

type Params = Promise<{ id: string }>;

/** Who has to act on a question, in a word. */
const BUCKET: Record<string, string> = {
  auto: "filled",
  drafted: "AI draft",
  needs_user: "needs them",
  cannot_automate: "in Chrome",
};

async function AdminApplication({ params }: { params: Params }) {
  const [{ admin, owner }, { id }] = await Promise.all([adminContext(), params]);
  const found = await getAnyApplication(admin, id);
  if (!found) notFound();
  const { app, userId } = found;
  const [profile, emails, runs] = await Promise.all([getUserProfile(admin, userId), listApplicationEmails(admin, userId, id), countApplyRuns(admin, id)]);
  const info = statusInfo(app.status);
  const now = new Date();
  const mine = userId === owner.id;
  return (
    <>
      <div className="rounded-xl border border-info/40 bg-info/10 px-4 py-3 text-sm">
        Viewing <Link href={`/admin/users/${userId}`} className="font-medium hover:underline">{displayName(profile)}</Link>&apos;s application as
        admin, read only.
        {mine && (
          <>
            {" "}It&apos;s yours: <Link href={`/app/applications/${id}`} className="font-medium hover:underline">open it to make changes</Link>.
          </>
        )}
      </div>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{app.job.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{app.job.company_name}</span>
          <Badge className={TONE_BADGE[info.tone]}>{info.label}</Badge>
          <span>changed {ago(app.last_status_at, now)}</span>
          {(app.job.apply_url ?? app.job.url) && (
            <a href={app.job.apply_url ?? app.job.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
              <ExternalLink className="size-3" /> Posting
            </a>
          )}
          {runs > 0 && (
            <Link href={`/admin/runs?application=${id}`} className="hover:text-foreground hover:underline">
              Runner log ({runs})
            </Link>
          )}
        </div>
        {(app.apply_note || app.prepare_error) && <p className="mt-1 text-sm">{app.apply_note ?? app.prepare_error}</p>}
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Questions ({app.questions.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {app.questions.length === 0 && <p className="text-sm text-muted-foreground">No form questions were found.</p>}
            {app.questions.map((q) => (
              <div key={q.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">{q.question}</span>
                  {q.required && <Badge className="bg-destructive/15 text-destructive">required</Badge>}
                  <Badge variant="outline">{BUCKET[q.bucket] ?? q.bucket}</Badge>
                </div>
                <p className="text-sm">{q.answer ?? <span className="text-muted-foreground">No answer</span>}</p>
                {q.reason && q.bucket !== "auto" && <p className="text-xs text-muted-foreground">{q.reason}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <EmailsCard emails={emails} now={now} />
        </div>
      </div>
    </>
  );
}

/** Any user's application for the admin: status, every question and answer, and its emails. Read only. */
export default function AdminApplicationPage({ params }: { params: Params }) {
  return (
    <main className="flex flex-col gap-4">
      <Link href="/admin/users" className={`${buttonVariants({ variant: "ghost", size: "sm" })} -mb-2 self-start`}>
        <ArrowLeft /> Users
      </Link>
      <Suspense fallback={<DetailSkeleton />}>
        <AdminApplication params={params} />
      </Suspense>
    </main>
  );
}
