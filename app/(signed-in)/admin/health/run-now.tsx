"use client";

import { Play } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { runWorkerAction } from "./actions";

/** Starts one worker on Railway now; the result shows up in Last run within a few minutes. */
export function RunNow({ worker, enabled }: { worker: string; enabled: boolean }) {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={!enabled || pending}
        title={enabled ? `Run ${worker} on Railway now` : "Set RAILWAY_TOKEN on Vercel to run workers from here"}
        onClick={() =>
          start(async () => {
            const error = await runWorkerAction(worker);
            setMessage(error ? { text: error, error: true } : { text: "Started. Results in a few minutes.", error: false });
          })
        }
      >
        <Play /> {pending ? "Starting…" : "Run now"}
      </Button>
      {message && (
        <p role={message.error ? "alert" : "status"} className={message.error ? "max-w-48 text-right text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
