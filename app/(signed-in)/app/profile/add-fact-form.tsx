"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage, type FormMessageState } from "../../_components/form-message";
import { addFactAction } from "./actions";

/** Form to add one fact to the profile. */
export function AddFactForm({ categories }: { categories: readonly string[] }) {
  const [state, action, pending] = useActionState<FormMessageState, FormData>(addFactAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <NativeSelect name="category" defaultValue="employment" aria-label="Category">
          {categories.map((c) => (
            <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>
          ))}
        </NativeSelect>
        <Textarea name="fact" rows={2} className="min-w-72 flex-1" placeholder="Staff Software Engineer at Second Nature, 2026–present" aria-label="Fact" />
        <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add fact"}</Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
