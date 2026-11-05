import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ownerContext } from "@/server/auth/require-owner";
import { loadPlatforms } from "@/server/modules/apply/apply.service";
import { getPublicHandle, isPublicPageEnabled } from "@/server/modules/public-page/public-page.service";
import { TONE_BADGE } from "../../_components/status";
import { setPlatformModeAction, setPublicPageAction } from "./actions";
import { FormSkeleton } from "../../_components/skeletons";
import { HandleForm } from "./handle-form";
import { cardsOnPhone } from "@/app/(signed-in)/_components/data-table";
import { cn } from "@/shared/cn";

async function PublicPageSetting() {
  const { db, owner } = await ownerContext();
  const [enabled, handle] = await Promise.all([isPublicPageEnabled(db, owner.id), getPublicHandle(db, owner.id)]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Public status page <Badge variant={enabled ? "secondary" : "outline"}>{enabled ? "On" : "Off"}</Badge>
        </CardTitle>
        <CardDescription>
          A read-only page at your own address showing jobs scanned, applications sent, responses and interviews, with each
          sent application&apos;s role, company, date and status. Nothing before you send an application appears, and no
          notes, answers or resumes are ever shown. Search engines are told not to index it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <HandleForm handle={handle} />
        <div className="flex flex-wrap items-center gap-3">
          <form action={setPublicPageAction}>
            <input type="hidden" name="enabled" value={String(!enabled)} />
            <Button type="submit" variant={enabled ? "outline" : "default"} disabled={!enabled && !handle} title={!handle ? "Pick an address first." : undefined}>
              {enabled ? "Turn off" : "Turn on"}
            </Button>
          </form>
          {enabled && handle && (
            <Link href={`/u/${handle}`} target="_blank" className="text-sm underline">View your page</Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const ATS_LABEL: Record<string, string> = { greenhouse: "Greenhouse", ashby: "Ashby", lever: "Lever" };
/** Job sites the runner can't fill yet, listed so it's clear what's covered. */
const COMING: string[] = [];

async function ApplyRunnerSetting() {
  const { db, owner } = await ownerContext();
  const platforms = await loadPlatforms(db, owner.id);
  const required = platforms[0]?.required ?? 3;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Apply runner</CardTitle>
        <CardDescription>
          Runs on your computer (<code className="rounded bg-muted px-1">pnpm worker:apply</code>) and fills approved
          applications in Chrome, one job site at a time. Supervised: it fills and you click Submit. After {required} submits in
          a row where you changed nothing, you can let it submit itself. A change or a failure puts it back on supervised.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table className={cardsOnPhone.table}>
          <TableHeader>
            <TableRow>
              <TableHead>Job site</TableHead>
              <TableHead>Submits</TableHead>
              <TableHead>Clean submits in a row</TableHead>
              <TableHead className="text-right"><span className="sr-only">Change</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {platforms.map((p) => {
              const done = Math.min(p.streak, p.required);
              return (
                <TableRow key={p.ats}>
                  <TableCell className={cn("font-medium", cardsOnPhone.first)}>{ATS_LABEL[p.ats] ?? p.ats}</TableCell>
                  <TableCell data-label="Submits">
                    <Badge className={p.mode === "auto" ? TONE_BADGE.success : TONE_BADGE.info}>{p.mode === "auto" ? "By itself" : "After you check (supervised)"}</Badge>
                  </TableCell>
                  <TableCell data-label="Clean submits in a row">
                    <div className="flex items-center gap-2" title={p.canAuto ? "Earned: it may submit by itself." : `${p.required - done} more to go.`}>
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <div className={p.canAuto ? "h-full bg-success" : "h-full bg-info"} style={{ width: `${(done / p.required) * 100}%` }} />
                      </div>
                      <span className="text-sm tabular-nums text-muted-foreground">{done}/{p.required}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <form action={setPlatformModeAction}>
                      <input type="hidden" name="ats" value={p.ats} />
                      <input type="hidden" name="mode" value={p.mode === "auto" ? "supervised" : "auto"} />
                      <Button
                        type="submit"
                        size="sm"
                        variant={p.mode === "auto" ? "outline" : "default"}
                        disabled={p.mode !== "auto" && !p.canAuto}
                        title={p.mode !== "auto" && !p.canAuto ? `Unlocks after ${p.required} clean submits in a row.` : undefined}
                      >
                        {p.mode === "auto" ? "Back to supervised" : "Let it submit"}
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              );
            })}
            {COMING.filter((ats) => !platforms.some((p) => p.ats === ats)).map((ats) => (
              <TableRow key={ats} className="text-muted-foreground">
                <TableCell className={cardsOnPhone.first}>{ATS_LABEL[ats]}</TableCell>
                <TableCell data-label="Submits" colSpan={3}>Not filled yet: approved applications wait in Approved, or you apply on the site.</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Settings: account-level switches (public status page, apply runner trust). */
export default function SettingsPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Suspense fallback={<FormSkeleton cards={2} />}>
        <PublicPageSetting />
        <ApplyRunnerSetting />
      </Suspense>
    </main>
  );
}
