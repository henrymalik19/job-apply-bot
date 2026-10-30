// Lessons: short rules learned from edits and skips ("Prefer product
// companies", "Never say 'passionate'"). Each LLM prompt includes the active
// lessons for its scope plus global ones.
import { z } from "zod";
import type { Db } from "@/server/db/types";
import { ValidationError } from "@/server/core/errors";
import * as lessons from "./lessons.repository";

export type { Lesson } from "./lessons.repository";

/** Where a lesson applies. */
export const LESSON_SCOPES = ["global", "scoring", "tailoring", "answers", "cover_letter", "platform"] as const;
/** One lesson scope. */
export type LessonScope = (typeof LESSON_SCOPES)[number];

/** Every lesson, for the Lessons page. */
export const listLessons = lessons.listLessons;

/** A user's active lessons for a prompt of the given scope, plus global ones. */
export async function lessonsFor(db: Db, userId: string, scope: Exclude<LessonScope, "global">) {
  return lessons.listActiveLessons(db, userId, ["global", scope]);
}

const lessonInput = z.object({
  rule: z.string().trim().min(3, "Write the rule.").max(500),
  scope: z.enum(LESSON_SCOPES, { message: "Pick where it applies." }),
});

/**
 * Adds a lesson typed by a user.
 *
 * @throws {@link ValidationError} for an empty rule or unknown scope.
 */
export async function addLesson(db: Db, userId: string, input: { rule: unknown; scope: unknown }): Promise<void> {
  const parsed = lessonInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid lesson.");
  await lessons.insertLesson(db, userId, { ...parsed.data, platform: null, source: "typed" });
}

/** Turns a lesson on or off. */
export async function setLessonActive(db: Db, userId: string, id: string, active: boolean): Promise<void> {
  await lessons.setLessonActive(db, userId, z.string().uuid().parse(id), active);
}
