"use client";

import { usePathname, useRouter } from "next/navigation";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { RunFilters } from "@/server/modules/apply/apply-runs";

/** Person and job pickers for Admin > Runs; picking one reloads the page filtered by it. */
export function RunFiltersBar({ filters, userId, applicationId }: { filters: RunFilters; userId: string; applicationId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (next: { user?: string; application?: string }) => {
    const params = new URLSearchParams();
    if (next.user) params.set("user", next.user);
    if (next.application) params.set("application", next.application);
    router.push(params.size ? `${pathname}?${params}` : pathname);
  };
  const total = filters.people.reduce((n, p) => n + p.runs, 0);
  const jobs = filters.jobs.filter((j) => !userId || j.userId === userId);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect aria-label="Person" value={userId} onChange={(e) => go({ user: e.target.value })} className="max-w-56">
        <NativeSelectOption value="">Everyone ({total} {total === 1 ? "run" : "runs"})</NativeSelectOption>
        {filters.people.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name} ({p.runs})</NativeSelectOption>)}
      </NativeSelect>
      <NativeSelect aria-label="Job" value={applicationId} onChange={(e) => go({ user: userId, application: e.target.value })} className="max-w-96">
        <NativeSelectOption value="">All jobs ({jobs.length})</NativeSelectOption>
        {jobs.map((j) => (
          <NativeSelectOption key={j.applicationId} value={j.applicationId}>
            {j.title} at {j.company} ({j.runs})
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
