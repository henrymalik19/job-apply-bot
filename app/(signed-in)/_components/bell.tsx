"use client";

import { Bell as BellIcon, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Notification } from "@/server/modules/notifications/in-app";
import { dismissNotificationsAction, markNotificationsReadAction } from "../app/notifications/actions";
import { NotificationList } from "./notification-list";

/** Small screens: the bell opens a panel under the top bar, like the Menu, instead of a popover. */
const PHONE = "(max-width: 767px)";

/** The panel's header: its title, Mark all read and Clear all. */
function Header({ unread, any, onClose }: { unread: number; any: boolean; onClose?: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-1 px-2 pt-1 pb-1.5">
      <span className="mr-auto text-sm font-semibold">Notifications</span>
      {unread > 0 && (
        <Button variant="ghost" size="xs" disabled={pending} onClick={() => startTransition(() => markNotificationsReadAction())}>
          Mark all read
        </Button>
      )}
      {any && (
        <Button variant="ghost" size="xs" disabled={pending} onClick={() => startTransition(() => dismissNotificationsAction())}>
          Clear all
        </Button>
      )}
      {onClose && (
        <Button variant="ghost" size="icon-sm" aria-label="Close notifications" onClick={onClose}>
          <X />
        </Button>
      )}
    </div>
  );
}

/** The bell: your unread count, and your latest notifications (a popover, or a full-width panel on a phone). */
export function Bell({ unread, latest }: { unread: number; latest: Notification[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- going to another page closes the panel
  useEffect(() => setOpen(false), [pathname]);

  const label = unread ? `Notifications, ${unread} unread` : "Notifications";
  const badge = unread > 0 && (
    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white tabular-nums">
      {unread > 99 ? "99+" : unread}
    </span>
  );
  const list = <NotificationList items={latest} onOpen={() => setOpen(false)} compact />;
  const seeAll = (
    <Link href="/app/notifications" onClick={() => setOpen(false)} className="rounded-md px-2 py-2 text-center text-sm text-primary hover:bg-muted">
      See all
    </Link>
  );

  return (
    <>
      <Popover
        open={open && !phone}
        onOpenChange={(next) => {
          const small = window.matchMedia(PHONE).matches;
          setPhone(small);
          // On a phone the popover never opens, so every tap on the bell toggles the panel.
          setOpen(small ? !open : next);
        }}
      >
        <PopoverTrigger render={<Button variant="ghost" size="icon" className="relative" aria-label={label} aria-expanded={open} />}>
          {open && phone ? <X /> : <BellIcon />}
          {badge}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)] gap-1 p-1.5">
          <Header unread={unread} any={latest.length > 0} />
          <div className="max-h-[60vh] overflow-y-auto">{list}</div>
          {seeAll}
        </PopoverContent>
      </Popover>
      {open && phone && (
        // Under the top bar, full width, like the Menu.
        <div id="notifications-panel" className="absolute inset-x-0 top-full z-40 flex max-h-[80svh] flex-col border-b bg-background px-2 pt-2 pb-3 shadow-lg md:hidden">
          <Header unread={unread} any={latest.length > 0} onClose={() => setOpen(false)} />
          <div className="min-h-0 flex-1 overflow-y-auto">{list}</div>
          {seeAll}
        </div>
      )}
    </>
  );
}
