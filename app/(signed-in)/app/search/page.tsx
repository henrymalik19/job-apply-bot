import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ownerContext } from "@/server/auth/require-owner";
import { getJobFilter, getTitleFilter, MAX_AGE_LIMIT_DAYS } from "@/server/modules/criteria/criteria.service";
import { JobFilterForm } from "./job-filter-form";
import { PruneForm } from "./prune-form";
import { TitleFilterForm } from "./title-filter-form";

async function SearchCriteria() {
  const { db } = await ownerContext();
  const [title, job] = await Promise.all([getTitleFilter(db), getJobFilter(db)]);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Job titles</CardTitle>
          <CardDescription>Whole words, case-insensitive, comma-separated.</CardDescription>
        </CardHeader>
        <CardContent>
          <TitleFilterForm include={title.include} exclude={title.exclude} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Work type, location and age</CardTitle>
          <CardDescription>Which jobs are worth saving at all.</CardDescription>
        </CardHeader>
        <CardContent>
          <JobFilterForm
            values={{
              workTypes: job.work_types,
              locations: job.locations,
              keepUnknownWorkType: job.keep_unknown_work_type,
              keepRemoteWithoutLocation: job.keep_remote_without_location,
              maxAgeDays: job.max_age_days,
              maxAgeLimit: MAX_AGE_LIMIT_DAYS,
            }}
          />
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Saved jobs</CardTitle>
          <CardDescription>
            Filters apply to new jobs as discovery finds them. After changing them, apply them to jobs already saved:
            jobs that no longer match are removed (jobs you&apos;ve applied to are always kept).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PruneForm />
        </CardContent>
      </Card>
    </div>
  );
}

/** Search: what you're looking for. Discovery filters today; matching criteria arrive in M4. */
export default function SearchPage() {
  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground">
          Discovery only saves jobs that pass these filters. Matching criteria (seniority, salary, dealbreakers) come
          with M4.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <SearchCriteria />
      </Suspense>
    </main>
  );
}
