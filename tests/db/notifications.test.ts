// In-app notifications, against a local Supabase: added once per event, listed newest first, counted
// and marked read; each user sees only their own.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import { countUnread, listNotifications, markRead, notify } from "@/server/modules/notifications/in-app";
import type {} from "./setup";
import { testUser } from "./users";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;
let userId = "";
let cleanupUser = async () => {};

beforeAll(async () => {
  ({ id: userId, cleanup: cleanupUser } = await testUser(db));
  await db.from("notifications").delete().eq("user_id", userId).like("title", "%at Acme");
});

afterAll(async () => {
  await db.from("notifications").delete().eq("user_id", userId).like("title", "%at Acme");
  await cleanupUser();
});

describe("in-app notifications", () => {
  it("adds one per event, lists newest first, counts unread and marks them read", async () => {
    await notify(db, userId, { kind: "submitted", title: "Submitted: Engineer at Acme" });
    await notify(db, userId, { kind: "interview", title: "Interview invite: Engineer at Acme", dedupeKey: "email:<1@x>" });
    // The same email seen again (a worker running twice) isn't a second notification.
    await notify(db, userId, { kind: "interview", title: "Interview invite: Engineer at Acme", dedupeKey: "email:<1@x>" });

    const list = (await listNotifications(db, userId)).filter((n) => n.title.endsWith("at Acme"));
    expect(list.map((n) => n.kind)).toEqual(["interview", "submitted"]);
    const before = await countUnread(db, userId);

    await markRead(db, userId, [list[0].id]);
    expect(await countUnread(db, userId)).toBe(before - 1);
    await markRead(db, userId);
    expect(await countUnread(db, userId)).toBe(0);
  });
});
