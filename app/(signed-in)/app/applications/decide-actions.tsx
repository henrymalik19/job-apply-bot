"use client";

import { Check, X } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { FormMessage, type FormMessageState } from "../../_components/form-message";
import { approveAction, skipAction } from "./actions";

/**
 * Approve and Skip as two equal buttons. Skip asks for an optional reason and
 * rule before it's confirmed.
 */
export function DecideActions({ applicationId, canApprove, back }: { applicationId: string; canApprove: boolean; back: string }) {
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
