"use client";

import { Check, RotateCw, Send, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/shared/cn";
import { FormMessage, type FormMessageState } from "../../_components/form-message";
import { approveAction, moveApplicationAction, retryApplyAction, skipAction, rebuildResumeAction } from "./actions";

/**
 * Approve and Skip as two equal buttons. Skip asks for an optional reason,
 * rule and whether to never match the company again before it's confirmed.
 */
export function DecideActions({ applicationId, company, canApprove, back }: { applicationId: string; company: string; canApprove: boolean; back: string }) {
  const [approveState, approve, approving] = useActionState<FormMessageState, FormData>(approveAction, {});
  const [skipState, skip, skipping] = useActionState<FormMessageState, FormData>(skipAction, {});
  const [skipOpen, setSkipOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {canApprove ? (
          <form action={approve}>
            <input type="hidden" name="application_id" value={applicationId} />
            <Button type="submit" disabled={approving} className="w-full bg-success text-background hover:bg-success/85">
              <Check /> {approving ? "Approving…" : "Approve"}
            </Button>
          </form>
        ) : (
          <Button disabled className="w-full" title="Answer every required question first">
            <Check /> Approve
          </Button>
        )}
        <Button type="button" variant="destructive" aria-expanded={skipOpen} onClick={() => setSkipOpen((v) => !v)} className="w-full">
          <X /> Skip
        </Button>
      </div>
      <FormMessage state={approveState} />
      {skipOpen && (
        <form action={skip} className="flex flex-col gap-2 rounded-lg border border-destructive/30 p-3">
          <input type="hidden" name="application_id" value={applicationId} />
          <input type="hidden" name="back" value={back} />
          <Input name="reason" placeholder="Why (optional), e.g. too much on-call" aria-label="Why you're skipping" />
          <Input name="lesson" placeholder="Rule for Claude (optional), e.g. Skip roles with heavy on-call" aria-label="Rule for Claude" />
          <NativeSelect name="lesson_scope" defaultValue="scoring" aria-label="The rule applies to">
            <NativeSelectOption value="scoring">Rule applies to scoring jobs</NativeSelectOption>
            <NativeSelectOption value="tailoring">Rule applies to resumes</NativeSelectOption>
            <NativeSelectOption value="answers">Rule applies to answers</NativeSelectOption>
            <NativeSelectOption value="global">Rule applies everywhere</NativeSelectOption>
          </NativeSelect>
          <input type="hidden" name="company" value={company} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="exclude_company" className="size-4 accent-destructive" />
            Never match jobs at {company}
          </label>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="destructive" disabled={skipping}>{skipping ? "Skipping…" : "Skip this job"}</Button>
            <Button type="button" variant="ghost" onClick={() => setSkipOpen(false)}>Cancel</Button>
          </div>
          <FormMessage state={skipState} />
        </form>
      )}
    </div>
  );
}

/** "Try the runner again" for an application the apply runner handed back. */
export function RetryApplyButton({ applicationId, className }: { applicationId: string; className?: string }) {
  const [state, retry, retrying] = useActionState<FormMessageState, FormData>(retryApplyAction, {});
  return (
    <form action={retry} className={cn("flex flex-col gap-1", className)}>
      <input type="hidden" name="application_id" value={applicationId} />
      <Button type="submit" size="sm" variant="outline" disabled={retrying || !!state.ok} className="w-fit">
        <RotateCw /> {retrying ? "Sending…" : "Try the runner again"}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

/** "I applied" for an application you submitted on the employer's site: moves it to Submitted. */
export function MarkAppliedButton({ applicationId, className }: { applicationId: string; className?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <span className={cn("flex flex-col gap-1", className)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending || done}
        className="w-fit"
        onClick={() =>
          startTransition(async () => {
            const err = await moveApplicationAction(applicationId, "submitted");
            if (err) setError(err);
            else setDone(true);
          })
        }
      >
        <Send /> {pending ? "Saving…" : done ? "Marked as applied" : "I applied"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </span>
  );
}

/** "Rebuild resume": tailors this application's resume again from your profile as it is now. */
export function RebuildResumeButton({ applicationId }: { applicationId: string }) {
  const [state, rebuild, rebuilding] = useActionState<FormMessageState, FormData>(rebuildResumeAction, {});
  return (
    <form action={rebuild} className="flex flex-col gap-1">
      <input type="hidden" name="application_id" value={applicationId} />
      <Button type="submit" size="sm" variant="outline" disabled={rebuilding} className="w-fit">
        <RotateCw className={rebuilding ? "animate-spin" : undefined} /> {rebuilding ? "Rebuilding…" : "Rebuild resume"}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
