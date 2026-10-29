"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { FormMessage } from "../../_components/form-message";
import { companyFormAction, type FormState } from "./actions";

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
      </div>
      <div className="flex gap-2">
        <Button type="submit" name="intent" value="test" variant="outline" disabled={pending}>Test board</Button>
        <Button type="submit" name="intent" value="add" disabled={pending}>{pending ? "Working…" : "Add company"}</Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
