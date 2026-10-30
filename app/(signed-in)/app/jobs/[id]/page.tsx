import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ownerContext } from "@/server/auth/require-owner";
import { MatchCard } from "../../../_components/match-card";
import { findJob } from "@/server/modules/jobs/jobs.service";
import { getJobMatch } from "@/server/modules/matching/matching.service";
import { ago, formatSalary } from "@/shared/format";

type Params = Promise<{ id: string }>;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function JobDetail({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { db, owner } = await ownerContext();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const job = await findJob(db, id);
  if (!job) notFound();
  const match = await getJobMatch(db, owner.id, job.id);

  const now = new Date();
  // Back to the same filtered page of the list.
  const back = new URLSearchParams(
    Object.entries(query).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
  ).toString();
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_currency);
  const facts = [
    job.location,
    job.remote_type && job.remote_type !== "unknown" ? job.remote_type : null,
    salary || null,
    job.posted_at ? `posted ${ago(job.posted_at, now)}` : null,
    `found ${ago(job.first_seen_at, now)}`,
    `via ${job.source}`,
  ].filter(Boolean);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/app/jobs${back ? `?${back}` : ""}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft aria-hidden /> All jobs
        </Link>
        <a href={job.apply_url ?? job.url} target="_blank" rel="noopener noreferrer" className={buttonVariants()}>
          Open posting <ExternalLink aria-hidden />
        </a>
      </div>
      <MatchCard match={match} />
      <Card className="md:min-h-0 md:flex-1">
        <CardHeader>
          <CardTitle className="text-xl">
            {job.title} {job.closed_at && <Badge variant="outline" className="ml-2 align-middle">Closed</Badge>}
          </CardTitle>
          <CardDescription>
            <span className="font-medium text-foreground">{job.company_name}</span> · {facts.join(" · ")}
          </CardDescription>
        </CardHeader>
        <CardContent className="md:min-h-0 md:flex-1 md:overflow-y-auto">
          {job.description_md ? (
            <div className="max-w-3xl whitespace-pre-wrap text-sm leading-relaxed">{job.description_md}</div>
          ) : (
            <p className="text-sm text-muted-foreground">No description was included. Open the posting to read it.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** One job: key facts, the full description and a link to the original posting. */
export default function JobPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <main className="flex flex-col gap-4 md:h-full">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <JobDetail params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
