"use client";

import { Check, Trash2 } from "lucide-react";
import { useActionState, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { AnswerKind, SavedAnswer } from "@/server/modules/questions/saved-answers";
import { asCountryName, countryNames } from "@/shared/countries";
import type { FormMessageState } from "../../_components/form-message";
import { deleteSavedAnswerAction, saveSavedAnswerAction } from "./actions";

const KIND_LABEL: Record<AnswerKind, string> = {
  yes_no: "Yes / No",
  number: "Number",
  range: "Range",
  short: "Text",
  long: "Long text",
  country: "Country",
};

/** Saves when a typed value is left changed (or on Enter, except in a long text box). */
function saveOnLeave(save: () => void, enter = true) {
  return {
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.currentTarget.value !== e.currentTarget.defaultValue) save();
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (enter && e.key === "Enter") {
        e.preventDefault();
        save();
      }
    },
  };
}

/** The answer's input, by kind: a Yes/No pick, number boxes, or a one-line or several-row text box. */
function AnswerInput({ a, save }: { a: SavedAnswer; save: () => void }) {
  if (a.kind === "country") {
    // Saved before the list ("American"): shown as its country when it names one, kept as it is otherwise.
    const named = asCountryName(a.shown);
    const other = named ? null : a.shown || null;
    return (
      <NativeSelect name="answer" defaultValue={named ?? other ?? ""} aria-label={a.label} className="w-64" onChange={save}>
        {other && <NativeSelectOption value={other}>{other}</NativeSelectOption>}
        {countryNames().map((n) => <NativeSelectOption key={n} value={n}>{n}</NativeSelectOption>)}
      </NativeSelect>
    );
  }
  if (a.kind === "yes_no") {
    return (
      <NativeSelect name="answer" defaultValue={/^yes$/i.test(a.shown) ? "Yes" : "No"} aria-label={a.label} className="w-28" onChange={save}>
        <NativeSelectOption value="Yes">Yes</NativeSelectOption>
        <NativeSelectOption value="No">No</NativeSelectOption>
      </NativeSelect>
    );
  }
  if (a.kind === "range") {
    const v = (a.value ?? {}) as { min?: number; max?: number };
    return (
      <div className="flex items-center gap-1.5">
        <Input name="answer_min" type="number" min={0} defaultValue={v.min ?? ""} aria-label={`${a.label}: from`} className="w-32 tabular-nums" {...saveOnLeave(save)} />
        <span className="text-muted-foreground">to</span>
        <Input name="answer_max" type="number" min={0} defaultValue={v.max ?? ""} aria-label={`${a.label}: to`} className="w-32 tabular-nums" {...saveOnLeave(save)} />
      </div>
    );
  }
  if (a.kind === "number") {
    return (
      <Input name="answer" type="number" step="any" defaultValue={typeof a.value === "number" ? a.value : a.shown} aria-label={a.label} className="w-32 tabular-nums" {...saveOnLeave(save)} />
    );
  }
  if (a.kind === "long") {
    return (
      <Textarea
        name="answer"
        defaultValue={a.shown}
        aria-label={a.label}
        rows={Math.min(6, Math.max(2, Math.ceil(a.shown.length / 70)))}
        className="min-w-0 flex-1"
        {...saveOnLeave(save, false)}
      />
    );
  }
  return <Input name="answer" defaultValue={a.shown} aria-label={a.label} className="min-w-0 flex-1" {...saveOnLeave(save)} />;
}

/**
 * One saved answer, edited in place: a pick saves at once, a typed answer when you leave it (or press
 * Enter). The delete button sits right after the answer.
 */
export function SavedAnswerRow({ a }: { a: SavedAnswer }) {
  const form = useRef<HTMLFormElement>(null);
  const [state, saveAction, saving] = useActionState<FormMessageState, FormData>(saveSavedAnswerAction, {});
  const save = () => form.current?.requestSubmit();
  const typed = a.kind === "short" || a.kind === "long";
  return (
    <form ref={form} action={saveAction} className="grid gap-2 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-4">
      <input type="hidden" name="question_id" value={a.questionId} />
      <div className="min-w-0">
        <div className="line-clamp-2 text-sm font-medium" title={a.label}>{a.label}</div>
        <Badge variant="outline" className="mt-1 text-xs font-normal text-muted-foreground">{KIND_LABEL[a.kind]}</Badge>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <div className={a.kind === "long" ? "flex min-w-0 items-start gap-1" : "flex min-w-0 items-center gap-1"}>
          <div className={typed ? "flex min-w-0 flex-1" : "flex min-w-0"}>
            <AnswerInput a={a} save={save} />
          </div>
          <span className="inline-flex w-5 shrink-0 justify-center text-xs" aria-live="polite">
            {saving ? <span className="text-muted-foreground">…</span> : state.ok ? <Check className="size-4 text-emerald-500" aria-label="Saved" /> : null}
          </span>
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            formAction={deleteSavedAnswerAction}
            aria-label={`Delete the saved answer to "${a.label}"`}
            title="Delete: forms ask you again"
            className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              if (!confirm("Delete this saved answer? Forms that ask it will ask you again.")) e.preventDefault();
            }}
          >
            <Trash2 />
          </Button>
        </div>
        {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      </div>
    </form>
  );
}
