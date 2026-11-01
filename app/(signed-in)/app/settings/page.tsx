import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ownerContext } from "@/server/auth/require-owner";
import { loadPlatforms } from "@/server/modules/apply/apply.service";
import { isPublicPageEnabled } from "@/server/modules/public-page/public-page.service";
import { TONE_BADGE } from "../../_components/status";
import { setPlatformModeAction, setPublicPageAction } from "./actions";

async function PublicPageSetting() {
  const { db, owner } = await ownerContext();
  const enabled = await isPublicPageEnabled(db, owner.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Public status page <Badge variant={enabled ? "secondary" : "outline"}>{enabled ? "On" : "Off"}</Badge>
        </CardTitle>
        <CardDescription>
          A read-only page at the site root showing jobs scanned, applications sent, responses and interviews, with each
          sent application&apos;s role, company, date and status. Nothing before you send an application appears, and no
          notes, answers or resumes are ever shown. Search engines are told not to index it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <form action={setPublicPageAction}>
          <input type="hidden" name="enabled" value={String(!enabled)} />
          <Button type="submit" variant={enabled ? "outline" : "default"}>{enabled ? "Turn off" : "Turn on"}</Button>
        </form>
        {enabled && (
          <Link href="/" target="_blank" className="text-sm underline">View public page</Link>
        )}
      </CardContent>
    </Card>
  );
}

const ATS_LABEL: Record<string, string> = { greenhouse: "Greenhouse" };

async function ApplyRunnerSetting() {
  const { db, owner } = await ownerContext();
  const platforms = await loadPlatforms(db, owner.id);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Apply runner</CardTitle>
        <CardDescription>
          Runs on your computer (<code className="rounded bg-muted px-1">pnpm worker:apply</code>) and fills approved
          applications in Chrome. Supervised: it fills and you click Submit. After {platforms[0]?.required ?? 3} submits in a
          row where you changed nothing, you can let it submit too. A change or a failure puts it back on supervised.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {platforms.map((p) => (
          <div key={p.ats} className="flex flex-wrap items-center gap-3 py-2 first:pt-0 last:pb-0">
            <span className="font-medium">{ATS_LABEL[p.ats] ?? p.ats}</span>
            <Badge className={p.mode === "auto" ? TONE_BADGE.success : TONE_BADGE.info}>{p.mode === "auto" ? "Submits itself" : "Supervised"}</Badge>
            <span className="text-sm text-muted-foreground tabular-nums">
              {Math.min(p.streak, p.required)}/{p.required} clean submits
            </span>
            <form action={setPlatformModeAction} className="ml-auto">
              <input type="hidden" name="ats" value={p.ats} />
              <input type="hidden" name="mode" value={p.mode === "auto" ? "supervised" : "auto"} />
              <Button type="submit" size="sm" variant="outline" disabled={p.mode !== "auto" && !p.canAuto}>
                {p.mode === "auto" ? "Back to supervised" : "Let it submit"}
              </Button>
            </form>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Settings: account-level switches (public status page, apply runner trust). */
export default function SettingsPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <PublicPageSetting />
        <ApplyRunnerSetting />
      </Suspense>
    </main>
  );
}
