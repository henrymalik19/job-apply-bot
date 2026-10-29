"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { companyFormAction, saveFilterAction, type FormState } from "./actions";

function Message({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-sm text-destructive">{state.error}</p>;
  if (!state.ok) return null;
  return (
    <div className="text-sm">
      <p className="text-emerald-700 dark:text-emerald-400">{state.ok}</p>
      {state.sample && state.sample.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
          {state.sample.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      )}
    </div>
  );
}

/** Add-company form with "Test board" (fetch once) and "Add company" buttons. */
export function AddCompanyForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(companyFormAction, {});
  const v = state.values ?? {};
  return (
    // key remounts the fields so defaultValue picks up the echoed values.
    <form key={JSON.stringify(v)} action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem_1fr_6rem]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Company</Label>
          <Input id="name" name="name" maxLength={200} defaultValue={v.name} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ats">ATS</Label>
          <NativeSelect id="ats" name="ats" defaultValue={v.ats || "greenhouse"} className="w-full">
            <NativeSelectOption value="greenhouse">Greenhouse</NativeSelectOption>
            <NativeSelectOption value="lever">Lever</NativeSelectOption>
            <NativeSelectOption value="ashby">Ashby</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="board_token">Board token</Label>
          <Input id="board_token" name="board_token" placeholder="e.g. stripe" defaultValue={v.board_token} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="priority">Priority</Label>
          <Input id="priority" name="priority" type="number" min={-100} max={100} defaultValue={v.priority ?? 0} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" name="intent" value="test" variant="outline" disabled={pending}>Test board</Button>
        <Button type="submit" name="intent" value="add" disabled={pending}>{pending ? "Working…" : "Add company"}</Button>
      </div>
      <Message state={state} />
    </form>
  );
}

/** Title-filter form: keep/skip phrase lists for job titles. */
export function FilterForm({ include, exclude }: { include: string[]; exclude: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveFilterAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
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
      <Message state={state} />
    </form>
  );
}
