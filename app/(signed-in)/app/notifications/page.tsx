import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ownerContext } from "@/server/auth/require-owner";
import { countUnread, listNotifications } from "@/server/modules/notifications/in-app";
import { NotificationList } from "../../_components/notification-list";
import { TableSkeleton } from "../../_components/skeletons";
import { MarkAllRead } from "./mark-all";

async function Notifications() {
  const { db, owner } = await ownerContext();
  const [items, unread] = await Promise.all([listNotifications(db, owner.id, 200), countUnread(db, owner.id)]);
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{unread ? `${unread} unread` : "All read"} · the last 90 days</p>
        {unread > 0 && <MarkAllRead />}
      </div>
      <Card className="md:min-h-0 md:flex-1">
        <CardContent className="md:min-h-0 md:flex-1 md:overflow-y-auto">
          <NotificationList items={items} />
        </CardContent>
      </Card>
    </>
  );
}

/** Notifications: everything you were told about (interview invites, replies, the runner, new applications), newest first. */
export default function NotificationsPage() {
  return (
    <main className="flex flex-col gap-4 md:h-full">
      <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <Notifications />
      </Suspense>
    </main>
  );
}
