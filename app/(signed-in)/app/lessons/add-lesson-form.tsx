"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { FormMessage, type FormMessageState } from "../../_components/form-message";
import { addLessonAction } from "./actions";

const SCOPES = [
  ["scoring", "Scoring"],
  ["global", "Everything"],
  ["tailoring", "Resume tailoring"],
  ["answers", "Application answers"],
  ["cover_letter", "Cover letters"],
] as const;

/** Form to add one lesson. */
export function AddLessonForm() {
  const [state, action, pending] = useActionState<FormMessageState, FormData>(addLessonAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input name="rule" className="min-w-72 flex-1" placeholder="Prefer product companies over agencies." aria-label="Rule" />
        <NativeSelect name="scope" defaultValue="scoring" aria-label="Applies to">
          {SCOPES.map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add lesson"}</Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
