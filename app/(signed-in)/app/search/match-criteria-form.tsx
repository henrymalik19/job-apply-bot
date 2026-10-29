"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage, type FormMessageState } from "../../_components/form-message";
import { saveMatchCriteriaAction } from "./actions";

/** Current matching criteria, as the form shows them. */
export type MatchCriteriaValues = {
  roles: string[];
  seniority: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  relocate: boolean | null;
  dealbreakers: string[];
  excludedCompanies: string[];
  threshold: number;
  notes: string;
};

const LEVELS = [
  ["junior", "Junior"],
  ["mid", "Mid"],
  ["senior", "Senior"],
  ["staff", "Staff"],
  ["principal", "Principal"],
  ["lead", "Lead"],
  ["manager", "Manager"],
  ["director", "Director"],
] as const;

const checkbox = "size-4 rounded border-input accent-primary";

/** Matching criteria form: roles, seniority, salary range, relocation, dealbreakers, excluded companies, threshold, notes. */
export function MatchCriteriaForm({ values }: { values: MatchCriteriaValues }) {
  const [state, action, pending] = useActionState<FormMessageState, FormData>(saveMatchCriteriaAction, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="roles">Target roles</Label>
          <Textarea id="roles" name="roles" rows={2} defaultValue={values.roles.join(", ")} placeholder="Staff Software Engineer, Senior Full Stack Engineer" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="notes">Preferences for the scorer</Label>
          <Textarea id="notes" name="notes" rows={2} defaultValue={values.notes} placeholder="Product-focused teams, TypeScript/Node, no heavy on-call" />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Seniority to keep (titles with no level always pass; none checked keeps all)</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {LEVELS.map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="seniority" value={value} defaultChecked={values.seniority.includes(value)} className={checkbox} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="dealbreakers">Dealbreakers (title or description)</Label>
          <Textarea id="dealbreakers" name="dealbreakers" rows={2} defaultValue={values.dealbreakers.join(", ")} placeholder="security clearance, relocation required" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="excludedCompanies">Never match these companies</Label>
          <Textarea id="excludedCompanies" name="excludedCompanies" rows={2} defaultValue={values.excludedCompanies.join(", ")} placeholder="Your current employer" />
        </div>
      </div>

      <div className="flex flex-wrap gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="salaryMin">Salary floor (yearly)</Label>
          <Input id="salaryMin" name="salaryMin" inputMode="numeric" defaultValue={values.salaryMin ?? ""} placeholder="160000" className="w-40" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="salaryMax">Top of range (stated on forms)</Label>
          <Input id="salaryMax" name="salaryMax" inputMode="numeric" defaultValue={values.salaryMax ?? ""} placeholder="190000" className="w-40" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="relocate">Willing to relocate</Label>
          <NativeSelect id="relocate" name="relocate" defaultValue={values.relocate == null ? "" : values.relocate ? "yes" : "no"}>
            <NativeSelectOption value="">Not set</NativeSelectOption>
            <NativeSelectOption value="yes">Yes</NativeSelectOption>
            <NativeSelectOption value="no">No</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="threshold">Match threshold (0–100)</Label>
          <Input id="threshold" name="threshold" type="number" min={0} max={100} defaultValue={values.threshold} className="w-28" />
        </div>
      </div>

      <div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save criteria"}</Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
