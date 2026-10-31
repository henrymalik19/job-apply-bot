import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ownerContext } from "@/server/auth/require-owner";
import { recentSamples } from "@/server/modules/runs/runs.service";
import { getJobFilter, getMatchCriteria, getTitleFilter, MAX_AGE_LIMIT_DAYS } from "@/server/modules/criteria/criteria.service";
import { listLessons, type Lesson } from "@/server/modules/lessons/lessons.service";
import { ago } from "@/shared/format";
import { AddRuleForm } from "./add-rule-form";
import { RULE_SCOPES } from "./rule-scopes";
import { JobFilterForm } from "./job-filter-form";
import { MatchCriteriaForm } from "./match-criteria-form";
import { PruneForm } from "./prune-form";
import { TitleFilterForm } from "./title-filter-form";
import { TitleSuggestions } from "./title-suggestions";
import { toggleLessonAction } from "./rule-actions";

const SCOPE_LABEL: Record<string, string> = Object.fromEntries(RULE_SCOPES);

/** Rules Claude follows: add one, see where each came from, turn them on or off. */
function RulesForClaude({ rules, now }: { rules: Lesson[]; now: Date }) {
  return (
    <Card id="rules" className="scroll-mt-4 xl:col-span-2">
      <CardHeader>
        <CardTitle>Rules for Claude ({rules.filter((r) => r.active).length} on)</CardTitle>
        <CardDescription>
          Short rules added to Claude&apos;s instructions from the next run. Scoring rules change match scores (&ldquo;Skip
          roles with heavy on-call&rdquo;); answer and resume rules change what it writes (&ldquo;Keep answers under 80
          words&rdquo;). You can also add one when you skip a job or answer a question.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AddRuleForm />
        {rules.length > 0 && (
          <ul className="divide-y">
            {rules.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-3 py-3 text-sm ${r.active ? "" : "opacity-60"}`}>
                <div className="min-w-60 flex-1">
                  <div>{r.rule}</div>
                  <div className="text-xs text-muted-foreground">{[r.source, ago(r.created_at, now)].filter(Boolean).join(" · ")}</div>
                </div>
                <Badge variant="secondary">{SCOPE_LABEL[r.scope] ?? r.scope}</Badge>
                <form action={toggleLessonAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="active" value={String(!r.active)} />
                  <Button type="submit" variant="ghost" size="xs">{r.active ? "Turn off" : "Turn on"}</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

async function SearchCriteria() {
  const { db, owner } = await ownerContext();
  const now = new Date();
  const [title, job, criteria, skipped, rules] = await Promise.all([
    getTitleFilter(db, owner.id),
    getJobFilter(db, owner.id),
    getMatchCriteria(db, owner.id),
    recentSamples(db, "discover", 30),
    listLessons(db, owner.id),
  ]);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Job titles</CardTitle>
          <CardDescription>Whole words, case-insensitive, comma-separated.</CardDescription>
        </CardHeader>
        <CardContent>
          <TitleFilterForm include={title.include} exclude={title.exclude} />
          <div className="mt-4">
            <TitleSuggestions />
          </div>
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
          <CardTitle>Matching criteria</CardTitle>
          <CardDescription>
            Jobs that pass discovery are checked against these rules, then scored 0–100 by Claude against your profile.
            Changes apply to jobs matched from now on; jobs already matched keep their score.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MatchCriteriaForm
            values={{
              roles: criteria.roles,
              seniority: criteria.seniority,
              salaryMin: criteria.salary_min,
              salaryMax: criteria.salary_max,
              relocate: criteria.willing_to_relocate,
              dealbreakers: criteria.dealbreakers,
              excludedCompanies: criteria.excluded_companies,
              threshold: criteria.threshold,
              notes: criteria.notes,
            }}
          />
        </CardContent>
      </Card>

      <RulesForClaude rules={rules} now={now} />

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Recently skipped</CardTitle>
          <CardDescription>
            A sample of postings the latest discovery runs didn&apos;t save, and why. If something here looks like a job
            you&apos;d want, loosen the matching filter.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {skipped.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet; samples appear after the next discovery run.</p>
          ) : (
            <ul className="grid gap-x-6 gap-y-1 text-sm md:grid-cols-2">
              {skipped.map((s, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate">
                    {s.title} <span className="text-muted-foreground">· {s.company}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">{s.reason}</span>
                </li>
              ))}
            </ul>
          )}
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

/** Search: what you're looking for. Discovery filters, matching criteria, rules for Claude, and re-filtering saved jobs. */
export default function SearchPage() {
  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground">
          Discovery only saves jobs that pass the first two filters; matching then scores what was saved.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <SearchCriteria />
      </Suspense>
    </main>
  );
}
