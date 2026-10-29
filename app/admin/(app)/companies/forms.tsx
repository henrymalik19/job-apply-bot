"use client";

import { useActionState } from "react";
import { companyFormAction, saveFilter, type FormState } from "./actions";

const input = "rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900";
const button =
  "rounded bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900";
const secondary = "rounded border border-zinc-300 px-3 py-2 text-sm font-medium disabled:opacity-50 dark:border-zinc-700";

function Message({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-sm text-red-600">{state.error}</p>;
  if (!state.ok) return null;
  return (
    <div className="text-sm text-green-700 dark:text-green-400">
      <p>{state.ok}</p>
      {state.sample && state.sample.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-zinc-600 dark:text-zinc-400">
          {state.sample.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      )}
    </div>
  );
}

export function AddCompanyForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(companyFormAction, {});
  const v = state.values ?? {};
  return (
    // key remounts the fields so defaultValue picks up the echoed values.
    <form key={JSON.stringify(v)} action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_1fr_6rem]">
        <label className="flex flex-col gap-1 text-sm">
          Company
          <input name="name" maxLength={200} defaultValue={v.name} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          ATS
          <select name="ats" defaultValue={v.ats || "greenhouse"} className={input}>
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="ashby">Ashby</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Board token
          <input name="board_token" placeholder="e.g. stripe" defaultValue={v.board_token} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Priority
          <input name="priority" type="number" defaultValue={v.priority ?? 0} min={-100} max={100} className={input} />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" name="intent" value="test" disabled={pending} className={secondary}>Test board</button>
        <button type="submit" name="intent" value="add" disabled={pending} className={button}>
          {pending ? "Working…" : "Add company"}
        </button>
      </div>
      <Message state={state} />
    </form>
  );
}

export function FilterForm({ include, exclude }: { include: string[]; exclude: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveFilter, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Keep titles containing any of (empty = keep all)
          <textarea name="include" rows={3} defaultValue={include.join(", ")} placeholder="engineer, developer" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Skip titles containing any of
          <textarea name="exclude" rows={3} defaultValue={exclude.join(", ")} placeholder="intern, sales" className={input} />
        </label>
      </div>
      <div>
        <button type="submit" disabled={pending} className={button}>{pending ? "Saving…" : "Save filter"}</button>
      </div>
      <Message state={state} />
    </form>
  );
}
