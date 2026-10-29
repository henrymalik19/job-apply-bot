"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage, type FormMessageState } from "../../_components/form-message";
import { saveTitleFilterAction } from "./actions";

/** Title-filter form: keep/skip phrase lists for job titles. */
export function TitleFilterForm({ include, exclude }: { include: string[]; exclude: string[] }) {
  const [state, action, pending] = useActionState<FormMessageState, FormData>(saveTitleFilterAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="include">Keep titles containing any of</Label>
          <Textarea id="include" name="include" rows={4} defaultValue={include.join(", ")} placeholder="Empty keeps everything" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="exclude">Skip titles containing any of</Label>
          <Textarea id="exclude" name="exclude" rows={4} defaultValue={exclude.join(", ")} placeholder="intern, sales" />
        </div>
      </div>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save filter"}</Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
