import { Badge } from "@/components/ui/badge";
import { APPLY_ATS } from "@/server/modules/apply/apply.service";
import { cn } from "@/shared/cn";
import { TONE_BADGE } from "./status";

const SITE_LABEL: Record<string, string> = { greenhouse: "Greenhouse", ashby: "Ashby", lever: "Lever", email: "Email alert" };

/** Whether the apply runner can fill this job's form. */
export const runnerFills = (source: string) => (APPLY_ATS as readonly string[]).includes(source);

/** Where the job's application lives; colored when the apply runner can fill it. */
export function SiteBadge({ source, className }: { source: string; className?: string }) {
  const fills = runnerFills(source);
  return (
    <Badge
      className={cn(fills ? TONE_BADGE.info : TONE_BADGE.muted, className)}
      title={fills ? "The apply runner fills this form" : "The apply runner can't fill this site yet; you apply yourself"}
    >
      {SITE_LABEL[source] ?? source}
    </Badge>
  );
}
