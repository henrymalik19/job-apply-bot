"use client";

import { Sparkles } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, type FormMessageState } from "../../_components/form-message";
import { mergeSkillsAction, removeSkillAction, suggestSkillCleanupAction, type CleanupState } from "./actions";

/** One suggested merge with its own Merge button; hides itself once merged. */
function MergeRow({ keep, merge, reason }: { keep: { id: string; name: string }; merge: { id: string; name: string }[]; reason: string }) {
  const [state, action, pending] = useActionState<FormMessageState, FormData>(mergeSkillsAction, {});
  if (state.ok) return null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
      <span className="flex-1">
        <span className="font-medium">{merge.map((m) => m.name).join(", ")}</span> → <span className="font-medium">{keep.name}</span>
        <span className="block text-xs text-muted-foreground">{reason}</span>
      </span>
      <form action={action}>
        <input type="hidden" name="keep_id" value={keep.id} />
        {merge.map((m) => <input key={m.id} type="hidden" name="merge_id" value={m.id} />)}
        <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Merging…" : "Merge"}</Button>
      </form>
      <FormMessage state={state} />
    </li>
  );
}

/** One entry that isn't a skill, with a Remove button (also unlinks it from your jobs). */
function NotSkillRow({ id, name, reason }: { id: string; name: string; reason: string }) {
  const [removed, setRemoved] = useState(false);
  if (removed) return null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
      <span className="flex-1">
        <span className="font-medium">{name}</span>
        <span className="block text-xs text-muted-foreground">{reason}</span>
      </span>
      <form action={removeSkillAction} onSubmit={() => setRemoved(true)}>
        <input type="hidden" name="skill_id" value={id} />
        <input type="hidden" name="from_jobs" value="on" />
        <Button type="submit" size="sm" variant="destructive">Remove</Button>
      </form>
    </li>
  );
}

/**
 * "Find duplicates": Claude looks over the skill list for the same skill under
 * different names and entries that aren't skills. Nothing changes until you
 * merge or remove.
 */
export function SkillCleanup() {
  const [state, find, finding] = useActionState<CleanupState>(suggestSkillCleanupAction, {});
  const merges = state.merges ?? [];
  const notSkills = state.notSkills ?? [];
  return (
    <div className="flex flex-col gap-3">
      <form action={find}>
        <Button type="submit" variant="outline" disabled={finding}>
          <Sparkles /> {finding ? "Looking…" : "Find duplicates"}
        </Button>
      </form>
      <FormMessage state={state} />
      {merges.length > 0 && (
        <div>
          <h4 className="text-sm font-medium">Same skill, different names</h4>
          <p className="text-xs text-muted-foreground">
            Merging keeps the name on the right. The others become aliases, so resumes and postings that use them still match.
          </p>
          <ul className="divide-y">{merges.map((m) => <MergeRow key={m.keep.id} {...m} />)}</ul>
        </div>
      )}
      {notSkills.length > 0 && (
        <div>
          <h4 className="text-sm font-medium">Probably not skills</h4>
          <p className="text-xs text-muted-foreground">Removing takes it off your list and off your jobs.</p>
          <ul className="divide-y">{notSkills.map((n) => <NotSkillRow key={n.id} {...n} />)}</ul>
        </div>
      )}
    </div>
  );
}
