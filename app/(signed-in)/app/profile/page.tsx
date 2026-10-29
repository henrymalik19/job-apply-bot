import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ownerContext } from "@/server/auth/require-owner";
import { FACT_CATEGORIES, listProfileFacts, type Fact } from "@/server/modules/profile/profile.service";
import { confirmFactAction, editFactAction, toggleFactAction } from "./actions";
import { AddFactForm } from "./add-fact-form";

function FactRow({ fact }: { fact: Fact }) {
  return (
    <li className={`flex flex-col gap-2 py-3 ${fact.active ? "" : "opacity-60"}`}>
      <form action={editFactAction} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={fact.id} />
        <Textarea name="fact" defaultValue={fact.fact} rows={Math.min(4, Math.ceil(fact.fact.length / 110))} aria-label="Fact" />
        <div className="flex flex-wrap items-center gap-2">
          {!fact.active ? (
            <Badge variant="outline">Off</Badge>
          ) : fact.reviewed ? (
            <Badge variant="secondary">Reviewed</Badge>
          ) : (
            <Badge variant="destructive">Needs review</Badge>
          )}
          {fact.source && fact.source !== "typed" && <span className="text-xs text-muted-foreground">from {fact.source}</span>}
          <div className="ml-auto flex gap-1">
            <Button type="submit" variant="ghost" size="xs">Save edit</Button>
            {!fact.reviewed && fact.active && (
              <Button type="submit" variant="outline" size="xs" formAction={confirmFactAction}>Confirm as true</Button>
            )}
            <input type="hidden" name="active" value={String(!fact.active)} />
            <Button type="submit" variant="ghost" size="xs" formAction={toggleFactAction}>{fact.active ? "Turn off" : "Turn on"}</Button>
          </div>
        </div>
      </form>
    </li>
  );
}

async function Profile() {
  const { db } = await ownerContext();
  const facts = await listProfileFacts(db);
  const needsReview = facts.filter((f) => f.active && !f.reviewed).length;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Add a fact</CardTitle>
          <CardDescription>
            One true statement per fact: a job (title, company, dates), a degree, a skill with years, a result with a
            number, work authorization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddFactForm categories={FACT_CATEGORIES} />
        </CardContent>
      </Card>

      {FACT_CATEGORIES.map((category) => {
        const inCategory = facts.filter((f) => f.category === category);
        if (inCategory.length === 0) return null;
        return (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="capitalize">{category}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">{inCategory.map((f) => <FactRow key={f.id} fact={f} />)}</ul>
            </CardContent>
          </Card>
        );
      })}

      {facts.length === 0 && <p className="text-sm text-muted-foreground">No facts yet.</p>}
      {needsReview > 0 && (
        <p className="text-sm text-muted-foreground">
          {needsReview} imported fact{needsReview === 1 ? "" : "s"} still need review. Scoring uses them already;
          resume tailoring (M5) will only use reviewed facts.
        </p>
      )}
    </>
  );
}

/** Profile: the facts about you that scoring (and later tailoring) may use. */
export default function ProfilePage() {
  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          The facts the system knows about you. Claude only uses what&apos;s here, and never invents anything beyond it.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Profile />
      </Suspense>
    </main>
  );
}
