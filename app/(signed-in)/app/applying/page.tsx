import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ownerContext } from "@/server/auth/require-owner";
import { listApplications, type ApplicationWithDetails } from "@/server/modules/applications/applications.service";
import { ago } from "@/shared/format";
import { runnerFills, SiteBadge } from "../../_components/site-badge";
import { APPLY_STEP_TITLE, TONE_BADGE } from "../../_components/status";

/** Recently submitted applications shown below the approved ones. */
const RECENT_LIMIT = 20;

function JobCell({ app }: { app: ApplicationWithDetails }) {
  return (
    <TableCell className="max-w-md whitespace-normal">
      <Link href={`/app/applications/${app.id}`} className="font-medium hover:underline">{app.job.title}</Link>
      <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        {app.job.company_name}
        <SiteBadge source={app.job.source} />
      </div>
    </TableCell>
  );
}

/** Where an approved application stands: queued for the runner, being filled, or yours to submit. */
function ApprovedState({ app }: { app: ApplicationWithDetails }) {
  if (!runnerFills(app.job.source)) {
    return (
      <a href={app.job.apply_url ?? app.job.url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <ExternalLink /> Apply yourself
      </a>
    );
  }
  if (app.apply_step) return <Badge className={TONE_BADGE.info}>{APPLY_STEP_TITLE[app.apply_step] ?? app.apply_step}</Badge>;
  return <Badge className={TONE_BADGE.muted}>Waiting for the runner</Badge>;
}

async function Applying() {
  const { db, owner } = await ownerContext();
  const [approved, done] = await Promise.all([
    listApplications(db, owner.id, ["approved"]),
    listApplications(db, owner.id, ["submitted", "confirmed"]),
  ]);
  const now = new Date();
  // The runner takes the oldest approval first.
  approved.sort((a, b) => (a.approved_at ?? "").localeCompare(b.approved_at ?? ""));
  const recent = done.sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? "")).slice(0, RECENT_LIMIT);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{approved.length} approved</CardTitle>
          <CardDescription>
            The apply runner on your computer (<code>pnpm worker:apply</code>) checks every 20 seconds and fills these one
            at a time, oldest first. Sites it can&apos;t fill yet are yours to apply to. Anything it hands back moves to
            Needs you with the reason.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {approved.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing approved right now. Approve applications on Review.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Approved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approved.map((a) => (
                  <TableRow key={a.id}>
                    <JobCell app={a} />
                    <TableCell className="whitespace-normal">
                      <ApprovedState app={a} />
                      {a.apply_note && <p className="mt-1 text-sm text-muted-foreground">{a.apply_note}</p>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.approved_at ? ago(a.approved_at, now) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recently submitted</CardTitle>
          <CardDescription>The last {RECENT_LIMIT} applications sent, newest first. Each keeps screenshots of the filled form and the confirmation.</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing submitted yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((a) => (
                  <TableRow key={a.id}>
                    <JobCell app={a} />
                    <TableCell className="text-muted-foreground">{a.submitted_at ? ago(a.submitted_at, now) : "—"}</TableCell>
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

/** Applying: approved applications and where each stands, then what was sent. */
export default function ApplyingPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Applying</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Applying />
      </Suspense>
    </main>
  );
}
