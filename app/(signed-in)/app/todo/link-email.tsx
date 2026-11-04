"use client";

import { Link2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { EmailKind } from "@/server/modules/tracking/classify";
import { dismissEmailAction, linkEmailAction } from "./actions";

/** An application an email can be linked to. */
export type LinkTarget = { id: string; label: string };

/** What an email can say, for one tracking couldn't sort. */
const KINDS = [
  { value: "confirmation", label: "Confirmation" },
  { value: "rejection", label: "Rejection" },
  { value: "interview", label: "Interview" },
  { value: "recruiter", label: "Recruiter reply" },
] as const;

/**
 * Picks the application an email is about (and, with `askKind`, what it says), or dismisses it.
 */
export function LinkEmail({ emailId, targets, suggested, askKind = false }: { emailId: string; targets: LinkTarget[]; suggested: string | null; askKind?: boolean }) {
  const [appId, setAppId] = useState(suggested ?? "");
  const [kind, setKind] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {askKind && (
          <NativeSelect aria-label="What the email says" value={kind} onChange={(e) => setKind(e.target.value)} className="max-w-40">
            <NativeSelectOption value="">What it says…</NativeSelectOption>
            {KINDS.map((k) => <NativeSelectOption key={k.value} value={k.value}>{k.label}</NativeSelectOption>)}
          </NativeSelect>
        )}
        <NativeSelect aria-label="Application this email is about" value={appId} onChange={(e) => setAppId(e.target.value)} className="max-w-64">
          <NativeSelectOption value="">Pick the application…</NativeSelectOption>
          {targets.map((t) => <NativeSelectOption key={t.id} value={t.id}>{t.label}</NativeSelectOption>)}
        </NativeSelect>
        <Button
          size="sm"
          disabled={!appId || (askKind && !kind) || pending}
          onClick={() => start(async () => setError(await linkEmailAction(emailId, appId, askKind ? (kind as EmailKind) : undefined)))}
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
