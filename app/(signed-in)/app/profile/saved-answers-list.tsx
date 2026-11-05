"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { SavedAnswer } from "@/server/modules/questions/saved-answers";
import { cn } from "@/shared/cn";
import { SavedAnswerRow } from "./saved-answer-row";

/** Question categories as section headings, in the order they're listed. */
const CATEGORIES: [string, string][] = [
  ["authorization", "Work authorization"],
  ["compensation", "Pay"],
  ["logistics", "Logistics"],
  ["skills", "Skills"],
  ["contact", "Contact"],
  ["links", "Links"],
  ["eeo", "Voluntary self-identification"],
  ["other", "Other"],
];
const LABEL = new Map(CATEGORIES);

/**
 * Saved answers grouped by category, with a search and category chips that stay put while the list
 * scrolls inside its box.
 */
export function SavedAnswersList({ answers }: { answers: SavedAnswer[] }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const present = CATEGORIES.filter(([c]) => answers.some((a) => (LABEL.has(a.category) ? a.category : "other") === c));
  const needle = q.trim().toLowerCase();
  const shown = answers.filter(
      (a) =>
        (!category || (LABEL.has(a.category) ? a.category : "other") === category) &&
        (!needle || a.label.toLowerCase().includes(needle) || a.shown.toLowerCase().includes(needle)),
    );
  const groups = CATEGORIES.map(([c, label]) => ({ c, label, items: shown.filter((a) => (LABEL.has(a.category) ? a.category : "other") === c) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions and answers" aria-label="Search saved answers" className="pl-8" />
        </div>
        {present.length > 1 && (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Category">
            {[[null, "All"] as [string | null, string], ...present].map(([c, label]) => (
              <button
                key={c ?? "all"}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
                  category === c && "border-primary bg-primary/10 text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border px-3 md:px-4">
        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No saved answers match.</p>
        ) : (
          groups.map((g) => (
            <section key={g.c} aria-label={g.label}>
              {(groups.length > 1 || present.length > 1) && (
                <h3 className="sticky top-0 z-10 -mx-3 border-b bg-card px-3 pt-3 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:-mx-4 md:px-4">
                  {g.label} <span className="font-normal tabular-nums">{g.items.length}</span>
                </h3>
              )}
              <div className="divide-y">
                {g.items.map((a) => <SavedAnswerRow key={a.questionId} a={a} />)}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
