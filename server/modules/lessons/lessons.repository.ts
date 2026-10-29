import type { Db, Insert, Row } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";

/** A row of `lessons`. */
export type Lesson = Row<"lessons">;

/** Every lesson, newest first. */
export async function listLessons(db: Db): Promise<Lesson[]> {
  return unwrap(await db.from("lessons").select("*").order("created_at", { ascending: false }), "list lessons");
}

/** Active lessons in any of the given scopes. */
export async function listActiveLessons(db: Db, scopes: string[]): Promise<Lesson[]> {
  return unwrap(
    await db.from("lessons").select("*").eq("active", true).in("scope", scopes).order("created_at"),
    "list active lessons",
  );
}

/** Adds a lesson. */
export async function insertLesson(db: Db, lesson: Pick<Insert<"lessons">, "rule" | "scope" | "platform" | "source">): Promise<void> {
  check(await db.from("lessons").insert(lesson), "insert lesson");
}

/** Turns a lesson on or off. */
export async function setLessonActive(db: Db, id: string, active: boolean): Promise<void> {
  check(await db.from("lessons").update({ active }).eq("id", id), "update lesson");
}
