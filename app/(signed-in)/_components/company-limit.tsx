import { Clock } from "lucide-react";
import type { CompanyLimit } from "@/server/modules/companies/apply-limits";
import { cn } from "@/shared/cn";

/** "Jan 4": the day you can apply at a company again. */
export const limitDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** "takes 2 applications per 60 days", or null when the company's rule isn't known. */
export function limitRule(limit: CompanyLimit): string | null {
  if (!limit.limit) return null;
  return `takes ${limit.limit} ${limit.limit === 1 ? "application" : "applications"}${limit.days ? ` per ${limit.days} days` : ""}`;
}

/**
 * A company's limit on applications, on a job's or an application's page: while you're at it, when you can
 * apply there again (nothing new is prepared there until then); otherwise just the rule.
 */
export function CompanyLimitNotice({ company, limit, className }: { company: string; limit: CompanyLimit | null; className?: string }) {
  if (!limit) return null;
  const rule = limitRule(limit);
  if (!limit.pausedUntil) {
    if (!rule) return null;
    return <p className={cn("text-sm text-muted-foreground", className)}>{company} {rule}.</p>;
  }
  return (
    <div className={cn("flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm", className)}>
      <Clock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p>
        <span className="font-medium">You can apply at {company} again on {limitDate(limit.pausedUntil)}.</span>{" "}
        {rule ? `It ${rule}, and you've reached that.` : "It said you reached its limit on applications."} Nothing new is
        prepared there until then; applications skipped for the limit come back on their own if the posting is still open.
      </p>
    </div>
  );
}
