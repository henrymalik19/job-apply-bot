"use client";

import { usePathname, useRouter } from "next/navigation";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { RunFilters } from "@/server/modules/apply/apply-runs";

/** Person, job and result pickers for Admin > Runs; picking one reloads the table filtered by it (page 1). */
export function RunFiltersBar({ filters, userId, applicationId, result }: { filters: RunFilters; userId: string; applicationId: string; result: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (next: { user?: string; application?: string; result?: string }) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    router.push(params.size ? `${pathname}?${params}` : pathname);
  };
  const total = filters.people.reduce((n, p) => n + p.runs, 0);
  const jobs = filters.jobs.filter((j) => !userId || j.userId === userId);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect aria-label="Person" value={userId} onChange={(e) => go({ user: e.target.value, result })} className="max-w-56">
        <NativeSelectOption value="">Everyone ({total} {total === 1 ? "run" : "runs"})</NativeSelectOption>
        {filters.people.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name} ({p.runs})</NativeSelectOption>)}
      </NativeSelect>
      <NativeSelect aria-label="Job" value={applicationId} onChange={(e) => go({ user: userId, application: e.target.value, result })} className="max-w-96">
        <NativeSelectOption value="">All jobs ({jobs.length})</NativeSelectOption>
        {jobs.map((j) => (
          <NativeSelectOption key={j.applicationId} value={j.applicationId}>
            {j.title} at {j.company} ({j.runs})
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Result" value={result} onChange={(e) => go({ user: userId, application: applicationId, result: e.target.value })} className="max-w-44">
        <NativeSelectOption value="">Any result</NativeSelectOption>
        <NativeSelectOption value="submitted">Submitted</NativeSelectOption>
        <NativeSelectOption value="handed_back">Handed back</NativeSelectOption>
      </NativeSelect>
    </div>
  );
}
