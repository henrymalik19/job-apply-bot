"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * A job's end month with "I work here now" under it: ticking it clears the month and turns the box
 * off (a disabled box isn't sent, so the job saves with no end month).
 */
export function EndMonth({ end, current }: { end: string; current: boolean }) {
  const [isCurrent, setCurrent] = useState(current);
  const [value, setValue] = useState(current ? "" : end);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="end_date" className={isCurrent ? "text-muted-foreground" : undefined}>End month</Label>
      <Input id="end_date" name="end_date" type="month" value={value} onChange={(e) => setValue(e.target.value)} disabled={isCurrent} />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_current"
          checked={isCurrent}
          onChange={(e) => {
            setCurrent(e.target.checked);
            if (e.target.checked) setValue("");
          }}
        />
        I work here now
      </label>
    </div>
  );
}
