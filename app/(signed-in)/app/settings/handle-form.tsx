"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setPublicHandleAction, type HandleState } from "./actions";

/** Picks the handle in the public page's address: /u/<handle>. */
export function HandleForm({ handle }: { handle: string | null }) {
  const [state, action, pending] = useActionState<HandleState, FormData>(setPublicHandleAction, {});
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <label htmlFor="public-handle" className="text-sm font-medium">Address</label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">/u/</span>
        <Input id="public-handle" name="handle" defaultValue={handle ?? ""} placeholder="your-name" className="max-w-48" required />
        <Button type="submit" variant="outline" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.saved && <p className="text-sm text-muted-foreground">Saved: your page is at /u/{state.saved}.</p>}
    </form>
  );
}
