import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ownerContext } from "@/server/auth/require-owner";
import { listLessons } from "@/server/modules/lessons/lessons.service";
import { toggleLessonAction } from "./actions";
import { AddLessonForm } from "./add-lesson-form";

const SCOPE_LABEL: Record<string, string> = {
  global: "Everything",
  scoring: "Scoring",
  tailoring: "Resume tailoring",
  answers: "Answers",
  cover_letter: "Cover letters",
  platform: "Platform",
};

async function Lessons() {
  const { db, owner } = await ownerContext();
  const lessons = await listLessons(db, owner.id);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Add a lesson</CardTitle>
          <CardDescription>
            A short rule Claude follows from now on. Scoring lessons change how jobs are scored; others apply when
            materials are written (M5).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddLessonForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lessons ({lessons.filter((l) => l.active).length} active)</CardTitle>
        </CardHeader>
        <CardContent>
          {lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lessons yet.</p>
          ) : (
            <ul className="divide-y">
              {lessons.map((l) => (
                <li key={l.id} className={`flex flex-wrap items-center gap-3 py-3 text-sm ${l.active ? "" : "opacity-60"}`}>
                  <span className="flex-1">{l.rule}</span>
                  <Badge variant="secondary">{SCOPE_LABEL[l.scope] ?? l.scope}</Badge>
                  {!l.active && <Badge variant="outline">Off</Badge>}
                  <form action={toggleLessonAction}>
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="active" value={String(!l.active)} />
                    <Button type="submit" variant="ghost" size="xs">{l.active ? "Turn off" : "Turn on"}</Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** Lessons: rules Claude follows when scoring and writing. */
export default function LessonsPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Lessons</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Lessons />
      </Suspense>
    </main>
  );
}
