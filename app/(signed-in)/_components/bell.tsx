"use client";

import { Bell as BellIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Notification } from "@/server/modules/notifications/in-app";
import { markNotificationsReadAction } from "../app/notifications/actions";
import { NotificationList } from "./notification-list";

/** The bell: your unread count, and your latest notifications in a panel. */
export function Bell({ unread, latest }: { unread: number; latest: Notification[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} />}
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)] gap-1 p-1.5">
        <div className="flex items-center justify-between px-2 pt-1 pb-1.5">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <Button variant="ghost" size="xs" disabled={pending} onClick={() => startTransition(() => markNotificationsReadAction())}>
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          <NotificationList items={latest} onOpen={() => setOpen(false)} compact />
        </div>
        <Link href="/app/notifications" onClick={() => setOpen(false)} className="rounded-md px-2 py-2 text-center text-sm text-primary hover:bg-muted">
          See all
        </Link>
      </PopoverContent>
    </Popover>
  );
}
