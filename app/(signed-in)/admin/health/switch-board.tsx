"use client";

import { ArrowRightLeft } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { switchBoardAction } from "./actions";

/** Switches a company to the board it moved to. */
export function SwitchBoard({ companyId, ats, boardToken, label }: { companyId: string; ats: string; boardToken: string; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        title="Follow the new board; the old board's jobs are closed. Discovery reads it on its next run."
        onClick={() => start(async () => setError(await switchBoardAction(companyId, ats, boardToken)))}
      >
        <ArrowRightLeft /> {pending ? "Switching…" : `Switch to ${label}`}
      </Button>
      {error && <span role="alert" className="text-destructive">{error}</span>}
    </>
  );
}
