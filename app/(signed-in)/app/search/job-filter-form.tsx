"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage, type FormMessageState } from "../../_components/form-message";
import { saveJobFilterAction } from "./actions";

/** Current values of the work-type, location and age filter. */
export type JobFilterValues = {
  workTypes: string[];
  locations: string[];
  keepUnknownWorkType: boolean;
  keepRemoteWithoutLocation: boolean;
  maxAgeDays: number;
  maxAgeLimit: number;
};

const TYPES = [
  ["remote", "Remote"],
  ["hybrid", "Hybrid"],
  ["onsite", "On-site"],
] as const;

const checkbox = "size-4 rounded border-input accent-primary";

/** Work type, location and posting-age form for discovery. */
export function JobFilterForm({ values }: { values: JobFilterValues }) {
  const [state, action, pending] = useActionState<FormMessageState, FormData>(saveJobFilterAction, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Work type (none checked keeps all)</legend>
        <div className="flex flex-wrap gap-5">
          {TYPES.map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="workTypes" value={value} defaultChecked={values.workTypes.includes(value)} className={checkbox} />
              {label}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="keepUnknownWorkType" defaultChecked={values.keepUnknownWorkType} className={checkbox} />
          Also keep jobs that don&apos;t state a work type
        </label>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="locations">Locations to keep (empty keeps all)</Label>
        <Textarea
          id="locations"
          name="locations"
          rows={2}
          defaultValue={values.locations.join(", ")}
          placeholder="US, New York, San Francisco, Texas"
        />
        <p className="text-xs text-muted-foreground">
          Countries, US states or cities. &quot;US&quot; keeps every US city (e.g. Houston, TX); &quot;Texas&quot; or
          &quot;TX&quot; keeps Austin and Dallas; NYC and SF work too.
        </p>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="keepRemoteWithoutLocation" defaultChecked={values.keepRemoteWithoutLocation} className={checkbox} />
          Keep remote jobs that don&apos;t name a country
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="maxAgeDays">Skip jobs posted more than this many days ago</Label>
        <Input
          id="maxAgeDays"
          name="maxAgeDays"
          type="number"
          min={1}
          max={values.maxAgeLimit}
          defaultValue={values.maxAgeDays}
          className="w-28"
        />
        <p className="text-xs text-muted-foreground">1–{values.maxAgeLimit} days. Jobs without a posting date are kept.</p>
      </div>

      <div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
