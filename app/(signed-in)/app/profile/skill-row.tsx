"use client";

import { Check, Trash2 } from "lucide-react";
import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { TableCell, TableRow } from "@/components/ui/table";
import type { FormMessageState } from "../../_components/form-message";
import { removeSkillAction, updateSkillAction } from "./actions";

/** A skill as the row shows it. */
export type SkillRowData = { skill_id: string; name: string; years_override: number | null; proficiency: string | null };

/**
 * One skill, edited in place: its years (blank = from your jobs) and proficiency save as you change
 * them. The trash button takes it off your list (it stays on the jobs that used it). Duplicates are
 * merged from Find duplicates.
 */
export function SkillRow(props: { s: SkillRowData; years: number | undefined; proficiencies: readonly string[] }) {
  const { s, years, proficiencies } = props;
  const formId = `skill-${s.skill_id}`;
  const form = useRef<HTMLFormElement>(null);
  const [state, save, saving] = useActionState<FormMessageState, FormData>(updateSkillAction, {});
  const submit = () => form.current?.requestSubmit();

  return (
    <TableRow>
      <TableCell className="font-medium">
        {/* The row's form; the inputs in the other cells belong to it by id. */}
        <form id={formId} ref={form} action={save} className="hidden">
          <input type="hidden" name="skill_id" value={s.skill_id} />
        </form>
        {s.name}
      </TableCell>
      <TableCell className="text-right">
        <Input
          form={formId}
          name="years_override"
          type="number"
          step="0.5"
          min={0}
          defaultValue={s.years_override ?? ""}
          // Blank means "from your jobs", which shows as the placeholder.
          placeholder={years != null ? String(years) : "—"}
          title={years != null ? `From your jobs: ${years}. Type a number only if that's wrong.` : "Years with this skill"}
          aria-label={`Years with ${s.name}`}
          className="ml-auto h-7 w-20 text-right tabular-nums"
          onBlur={(e) => {
            if (e.currentTarget.value !== String(s.years_override ?? "")) submit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
      </TableCell>
      <TableCell>
        <NativeSelect
          form={formId}
          name="proficiency"
          defaultValue={s.proficiency ?? ""}
          aria-label={`Proficiency in ${s.name}`}
          className="h-7 w-32 capitalize"
          onChange={submit}
        >
          <NativeSelectOption value="">—</NativeSelectOption>
          {proficiencies.map((x) => <NativeSelectOption key={x} value={x}>{x}</NativeSelectOption>)}
        </NativeSelect>
      </TableCell>
      <TableCell className="w-0 text-right whitespace-nowrap">
        <span className="mr-1 inline-flex w-4 justify-center text-xs" aria-live="polite">
          {saving ? <span className="text-muted-foreground">…</span> : state.error ? <span className="text-destructive" title={state.error}>!</span> : state.ok ? <Check className="size-4 text-emerald-500" aria-label="Saved" /> : null}
        </span>
        <Button
          type="submit"
          form={formId}
          formAction={removeSkillAction}
          size="icon-sm"
          variant="ghost"
          aria-label={`Remove ${s.name}`}
          title="Remove from your skills (it stays on the jobs that used it)"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={(e) => {
            if (!confirm(`Remove ${s.name} from your skills? It stays on the jobs that used it.`)) e.preventDefault();
          }}
        >
          <Trash2 />
        </Button>
      </TableCell>
    </TableRow>
  );
}
