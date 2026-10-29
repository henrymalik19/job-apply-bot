import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ownerContext } from "@/server/auth/require-owner";
import { isPublicPageEnabled } from "@/server/modules/public-page/public-page.service";
import { setPublicPageAction } from "./actions";

async function PublicPageSetting() {
  const { db } = await ownerContext();
  const enabled = await isPublicPageEnabled(db);

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

/** Settings: account-level switches (the public status page today). */
export default function SettingsPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <PublicPageSetting />
      </Suspense>
    </main>
  );
}
