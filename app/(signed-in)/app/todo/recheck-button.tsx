"use client";

import { RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, type FormMessageState } from "../../_components/form-message";
import { recheckOpenQuestionsAction } from "./actions";

/**
 * Sorts the open questions of every waiting application again with today's rules, saved answers and
 * profile (after you've added saved answers or the rules changed), filling what it can now.
 */
export function RecheckButton() {
  const [state, recheck, pending] = useActionState<FormMessageState>(async () => recheckOpenQuestionsAction(), {});
  return (
    <form action={recheck} className="flex flex-wrap items-center justify-end gap-3">
      <FormMessage state={state} />
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        title="Updates answers from your current profile and saved answers, and answers open questions again: one quick Claude call per application with new questions."
      >
        <RefreshCw className={pending ? "animate-spin" : undefined} /> {pending ? "Rechecking…" : "Recheck answers"}
      </Button>
    </form>
  );
}
