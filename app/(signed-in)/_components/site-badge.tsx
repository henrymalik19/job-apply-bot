import { Badge } from "@/components/ui/badge";
import { APPLY_ATS } from "@/server/modules/apply/apply.service";
import { cn } from "@/shared/cn";
import { TONE_BADGE } from "./status";

/** Label and brand color per site (colors taken from each company's own site). */
const SITE: Record<string, { label: string; className: string }> = {
  greenhouse: { label: "Greenhouse", className: "bg-[#008561]/12 text-[#006147] dark:bg-[#4cb398]/20 dark:text-[#90d1c2]" },
  ashby: { label: "Ashby", className: "bg-[#483fad]/12 text-[#483fad] dark:bg-[#8b84e0]/20 dark:text-[#c4bff5]" },
  lever: { label: "Lever", className: "bg-[#2a7a72]/12 text-[#2a7a72] dark:bg-[#5fb8ae]/20 dark:text-[#9fd8d1]" },
  linkedin: { label: "LinkedIn", className: "bg-[#0a66c2]/12 text-[#0a66c2] dark:bg-[#4d9be6]/20 dark:text-[#a9cdf2]" },
  email: { label: "Email alert", className: TONE_BADGE.muted },
};

/** Whether the apply runner can fill this job's form. */
export const runnerFills = (source: string) => (APPLY_ATS as readonly string[]).includes(source);

/** Where the job's application lives, in that site's brand color. */
export function SiteBadge({ source, className }: { source: string; className?: string }) {
  const site = SITE[source];
  return (
    <Badge
      className={cn(site?.className ?? TONE_BADGE.muted, className)}
      title={runnerFills(source) ? "The apply runner fills this form" : "The apply runner can't fill this site yet; it waits in Approved, or you apply yourself"}
    >
      {site?.label ?? source}
    </Badge>
  );
}
