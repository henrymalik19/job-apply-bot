import { ownerContext } from "@/server/auth/require-owner";
import { countUnread, listNotifications } from "@/server/modules/notifications/in-app";
import { serverEnv } from "@/shared/env";
import { Bell } from "./bell";
import { LiveUpdates } from "./live-updates";

/** The bell (your unread notifications) and the live connection that refreshes pages when something changes. */
export async function NotificationsBell() {
  const { db, owner } = await ownerContext();
  const [unread, latest, { data: session }] = await Promise.all([countUnread(db, owner.id), listNotifications(db, owner.id, 15), db.auth.getSession()]);
  const env = serverEnv();
  return (
    <>
      <Bell unread={unread} latest={latest} />
      {session.session && (
        <LiveUpdates url={env.SUPABASE_URL} anonKey={env.SUPABASE_ANON_KEY} token={session.session.access_token} userId={owner.id} />
      )}
    </>
  );
}
