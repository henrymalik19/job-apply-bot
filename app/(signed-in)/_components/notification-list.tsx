"use client";

import { Bell, CalendarCheck, CircleAlert, CircleCheck, Inbox, Mail, MessageSquare, MousePointerClick, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { Notification, NotificationKind } from "@/server/modules/notifications/in-app";
import { cn } from "@/shared/cn";
import { dismissNotificationsAction, markNotificationsReadAction } from "../app/notifications/actions";

/** Each kind's icon and color. */
const LOOK: Record<NotificationKind, { icon: typeof Bell; className: string }> = {
  interview: { icon: CalendarCheck, className: "text-success" },
  reply: { icon: MessageSquare, className: "text-info" },
  rejection: { icon: X, className: "text-muted-foreground" },
  email_to_sort: { icon: Mail, className: "text-warning" },
  runner_waiting: { icon: MousePointerClick, className: "text-warning" },
  runner_stuck: { icon: CircleAlert, className: "text-destructive" },
  submitted: { icon: CircleCheck, className: "text-success" },
  prepared: { icon: Inbox, className: "text-info" },
};

/** How long ago, short: "now", "5m", "3h", "2d", then the date. */
function when(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Notifications as a list: each with its icon, what happened and when, unread ones marked. Tapping one
 * marks it read and goes where it leads; its × dismisses it (gone at once, then from the server).
 */
export function NotificationList({ items, onOpen, compact = false }: { items: Notification[]; onOpen?: () => void; compact?: boolean }) {
  const [, startTransition] = useTransition();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const shown = items.filter((n) => !gone.has(n.id));
  const dismiss = (ids: string[]) => {
    setGone((g) => new Set([...g, ...ids]));
    startTransition(() => dismissNotificationsAction(ids));
  };
  if (shown.length === 0) {
    return <p className="px-2 py-8 text-center text-sm text-muted-foreground">Nothing here. Interview invites, replies and the runner show up here.</p>;
  }
  return (
    <ul className="flex flex-col">
      {shown.map((n) => {
        const look = LOOK[n.kind] ?? { icon: Bell, className: "text-muted-foreground" };
        const Icon = look.icon;
        const open = () => {
          if (!n.readAt) startTransition(() => markNotificationsReadAction([n.id]));
          onOpen?.();
        };
        const body = (
          <>
            <Icon className={cn("mt-0.5 size-4 shrink-0", look.className)} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn("text-sm", n.readAt ? "text-muted-foreground" : "font-medium")}>{n.title}</span>
              {n.body && <span className={cn("text-xs text-muted-foreground", compact && "line-clamp-2")}>{n.body}</span>}
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground tabular-nums">{when(n.createdAt)}</span>
              {!n.readAt && <span className="size-2 rounded-full bg-primary" aria-label="Unread" />}
            </span>
          </>
        );
        const row = "flex min-w-0 flex-1 items-start gap-2.5 px-2 py-2.5 text-left";
        return (
          <li key={n.id} className="group flex items-start rounded-md hover:bg-muted">
            {n.href ? (
              <Link href={n.href} onClick={open} className={row}>{body}</Link>
            ) : (
              <button type="button" onClick={open} className={row}>{body}</button>
            )}
            <button
              type="button"
              onClick={() => dismiss([n.id])}
              aria-label={`Dismiss: ${n.title}`}
              title="Dismiss"
              className="mt-1.5 mr-1 shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-foreground md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
            >
              <X className="size-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
