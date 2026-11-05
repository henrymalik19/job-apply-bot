"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markNotificationsReadAction } from "./actions";

/** Marks all your notifications read. */
export function MarkAllRead() {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(() => markNotificationsReadAction())}>
      Mark all read
    </Button>
  );
}
