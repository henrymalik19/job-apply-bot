"use client";

import { Search } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { FormMessage } from "../../_components/form-message";
import type { FoundBoard } from "@/server/modules/companies/companies.service";
import { companyFormAction, findCompanyAction, type FindState, type FormState } from "./actions";

const ATS_LABEL: Record<string, string> = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby" };

/** "Add" for one board the finder turned up, with the company name editable. */
function AddFoundBoard({ board, name }: { board: FoundBoard; name: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(companyFormAction, {});
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <div>
        <span className="font-medium">{ATS_LABEL[board.ats]}</span>
        <span className="ml-2 font-mono text-xs text-muted-foreground">{board.board_token}</span>
        <span className="ml-2 text-muted-foreground">
          {board.count.toLocaleString()} open job{board.count === 1 ? "" : "s"}
          {board.sampleTitles.length > 0 && `, e.g. ${board.sampleTitles.join(" · ")}`}
        </span>
      </div>
      {state.ok ? (
        <FormMessage state={state} />
      ) : (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="intent" value="add" />
          <input type="hidden" name="ats" value={board.ats} />
          <input type="hidden" name="board_token" value={board.board_token} />
          <Input name="name" defaultValue={name} maxLength={200} aria-label="Company name" className="h-8 w-56" />
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Adding…" : "Add"}</Button>
          <FormMessage state={state} />
        </form>
      )}
    </li>
  );
}

/** Find a company's board by name or URL, then add one of the boards found. */
export function FindCompanyForm() {
  const [state, action, pending] = useActionState<FindState, FormData>(findCompanyAction, {});
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-wrap gap-2">
        <Input
          name="query"
          defaultValue={state.query}
          placeholder="Company name, or a link to its job board or a posting"
          aria-label="Company name or job-board link"
          className="min-w-72 flex-1"
        />
        <Button type="submit" disabled={pending}>
          <Search /> {pending ? "Looking…" : "Find"}
        </Button>
      </form>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.found && (
        <ul key={state.query} className="flex flex-col gap-2">
          {state.found.map((b) => <AddFoundBoard key={`${b.ats}:${b.board_token}`} board={b} name={state.name ?? ""} />)}
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
      </div>
      <div className="flex gap-2">
        <Button type="submit" name="intent" value="test" variant="outline" disabled={pending}>Test board</Button>
        <Button type="submit" name="intent" value="add" disabled={pending}>{pending ? "Working…" : "Add company"}</Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
