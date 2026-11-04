import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { UnmatchedEmail } from "@/server/modules/tracking/tracking.service";
import { ago } from "@/shared/format";
import { TONE_BADGE, type Tone } from "../../_components/status";

/** What each kind of email says, and its badge color. */
const KIND: Record<string, { label: string; tone: Tone }> = {
  confirmation: { label: "Confirmation", tone: "info" },
  rejection: { label: "Rejection", tone: "muted" },
  interview: { label: "Interview", tone: "success" },
  recruiter: { label: "Recruiter reply", tone: "success" },
};

/** The emails in the job inbox about this application, newest first. */
export function EmailsCard({ emails, now }: { emails: UnmatchedEmail[]; now: Date }) {
  if (emails.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Emails</CardTitle>
        <CardDescription>From the job inbox: the employer&apos;s receipt and any replies, found by email tracking or linked by you.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {emails.map((e) => {
          const kind = KIND[e.kind];
          return (
            <div key={e.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{e.subject || "(no subject)"}</span>
                  {kind && <Badge className={TONE_BADGE[kind.tone]}>{kind.label}</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {e.from} · <span title={new Date(e.receivedAt).toLocaleString()}>{ago(e.receivedAt, now)}</span>
                </span>
                {e.snippet && <p className="line-clamp-3 text-sm text-muted-foreground">{e.snippet}</p>}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
