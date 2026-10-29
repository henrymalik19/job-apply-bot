"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, type FormMessageState } from "../../_components/form-message";
import { pruneSavedJobsAction } from "./actions";

/** "Apply to saved jobs" button: removes saved jobs that no longer match the filters. */
export function PruneForm() {
  const [state, action, pending] = useActionState<FormMessageState>(pruneSavedJobsAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div>
        <Button type="submit" variant="outline" disabled={pending}>{pending ? "Checking saved jobs…" : "Apply to saved jobs"}</Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
