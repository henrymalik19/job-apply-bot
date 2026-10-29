"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, type FormMessageState } from "../../_components/form-message";
import { addSuggestionsAction, suggestTitlesAction, type SuggestState } from "./actions";

const checkbox = "mt-0.5 size-4 shrink-0 rounded border-input accent-primary";

function Group({ name, title, items }: { name: "keep" | "skip"; title: string; items: { phrase: string; reason: string }[] }) {
  if (items.length === 0) return null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{title}</legend>
      {items.map((s) => (
        <label key={s.phrase} className="flex items-start gap-2 text-sm">
          <input type="checkbox" name={name} value={s.phrase} defaultChecked className={checkbox} />
          <span>
            <span className="font-medium">{s.phrase}</span> <span className="text-muted-foreground">— {s.reason}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** "Suggest from my profile": Claude proposes title phrases; the owner ticks which to add. */
export function TitleSuggestions() {
  const [suggested, suggest, suggesting] = useActionState<SuggestState>(suggestTitlesAction, {});
  const [added, add, adding] = useActionState<FormMessageState, FormData>(addSuggestionsAction, {});
  const has = (suggested.keep?.length ?? 0) + (suggested.skip?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <form action={suggest}>
        <Button type="submit" variant="outline" disabled={suggesting}>
          {suggesting ? "Asking Claude…" : "Suggest from my profile"}
        </Button>
      </form>
      <FormMessage state={suggested} />
      {has && (
        <form action={add} className="flex flex-col gap-4">
          <Group name="keep" title="Keep titles containing" items={suggested.keep ?? []} />
          <Group name="skip" title="Skip titles containing" items={suggested.skip ?? []} />
          <div>
            <Button type="submit" disabled={adding}>{adding ? "Adding…" : "Add ticked phrases"}</Button>
          </div>
          <FormMessage state={added} />
        </form>
      )}
    </div>
  );
}
