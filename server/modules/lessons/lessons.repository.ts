import type { Db, Insert, Row } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";

/** A row of `lessons`. */
export type Lesson = Row<"lessons">;

/** A user's lessons, newest first. */
export async function listLessons(db: Db, userId: string): Promise<Lesson[]> {
  return unwrap(
    await db.from("lessons").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    "list lessons",
  );
}

/** A user's active lessons in any of the given scopes. */
export async function listActiveLessons(db: Db, userId: string, scopes: string[]): Promise<Lesson[]> {
  return unwrap(
    await db.from("lessons").select("*").eq("user_id", userId).eq("active", true).in("scope", scopes).order("created_at"),
    "list active lessons",
  );
}

/** Adds a lesson for a user. */
export async function insertLesson(
  db: Db,
  userId: string,
  lesson: Pick<Insert<"lessons">, "rule" | "scope" | "platform" | "source">,
): Promise<void> {
  check(await db.from("lessons").insert({ ...lesson, user_id: userId }), "insert lesson");
}

/** Turns one of a user's lessons on or off. */
export async function setLessonActive(db: Db, userId: string, id: string, active: boolean): Promise<void> {
  check(await db.from("lessons").update({ active }).eq("user_id", userId).eq("id", id), "update lesson");
}
