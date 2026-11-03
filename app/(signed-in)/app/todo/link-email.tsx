"use client";

import { Link2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { dismissEmailAction, linkEmailAction } from "./actions";

/** An application an email can be linked to. */
export type LinkTarget = { id: string; label: string };

/** Picks the application an unmatched email is about, or dismisses it. */
export function LinkEmail({ emailId, targets, suggested }: { emailId: string; targets: LinkTarget[]; suggested: string | null }) {
  const [appId, setAppId] = useState(suggested ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label="Application this email is about" value={appId} onChange={(e) => setAppId(e.target.value)} className="max-w-64">
          <NativeSelectOption value="">Pick the application…</NativeSelectOption>
          {targets.map((t) => <NativeSelectOption key={t.id} value={t.id}>{t.label}</NativeSelectOption>)}
        </NativeSelect>
        <Button
          size="sm"
          disabled={!appId || pending}
          onClick={() => start(async () => setError(await linkEmailAction(emailId, appId)))}
        >
          <Link2 /> {pending ? "Linking…" : "Link"}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} title="Not about an application" onClick={() => start(() => dismissEmailAction(emailId))}>
          <X /> Dismiss
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
