"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition, type ReactNode } from "react";
import { cn } from "@/shared/cn";
import { moveApplicationAction } from "../applications/actions";

/** One application as a card; `badge` is the site badge, rendered on the server. */
export type BoardCard = {
  id: string;
  status: string;
  title: string;
  company: string;
  badge: ReactNode;
  /** One line under the company: the runner's progress, or when it got here. */
  line: string;
  /** Approved on a site the runner can't fill, or stuck: where to apply. */
  applyUrl?: string | null;
  /** Stuck, and the apply runner can try it again (moving it to Approved). */
  canRetry?: boolean;
};

/**
 * A board column: the statuses it shows and the status a card dropped on it moves to, the
 * first of `target` the card can move to (Closed is Rejected after submitting, Expired before).
 */
export type BoardColumn = {
  key: string;
  label: string;
  statuses: string[];
  target: string | string[] | null;
  /** The lane's color: its top edge, count and the edge of its cards. */
  accent: Accent;
  muted?: boolean;
};

/** Lane colors, written out in full so Tailwind keeps the classes. */
const ACCENTS = {
  sky: { lane: "border-t-sky-500", count: "bg-sky-500/15 text-sky-700 dark:text-sky-300", card: "border-l-sky-500" },
  amber: { lane: "border-t-amber-500", count: "bg-amber-500/15 text-amber-700 dark:text-amber-300", card: "border-l-amber-500" },
  indigo: { lane: "border-t-indigo-500", count: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300", card: "border-l-indigo-500" },
  violet: { lane: "border-t-violet-500", count: "bg-violet-500/15 text-violet-700 dark:text-violet-300", card: "border-l-violet-500" },
  teal: { lane: "border-t-teal-500", count: "bg-teal-500/15 text-teal-700 dark:text-teal-300", card: "border-l-teal-500" },
  emerald: { lane: "border-t-emerald-500", count: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", card: "border-l-emerald-500" },
  zinc: { lane: "border-t-zinc-400", count: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400", card: "border-l-zinc-400" },
} as const;
/** A lane color name. */
export type Accent = keyof typeof ACCENTS;

/** Hides a scroll area's scrollbar; it still scrolls by wheel, trackpad and touch. */
const NO_SCROLLBAR = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Name of each status you can move a card to, for the Move menu. */
const TARGET_LABEL: Record<string, string> = {
  approved: "Approved (retry)",
  submitted: "Submitted",
  responded: "Heard back",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  expired: "Closed (posting gone)",
};

/**
 * Post-approval applications as columns. Drag a card to another column, or use
 * its Move menu, to record that you applied, heard back, got an interview, an
 * offer or a no; only moves the database allows are offered.
 */
export function Board({ columns, cards, moves }: { columns: BoardColumn[]; cards: BoardCard[]; moves: Record<string, string[]> }) {
  const [shown, move] = useOptimistic(cards, (list, m: { id: string; to: string }) =>
    list.map((c) => (c.id === m.id ? { ...c, status: m.to, line: "Moving…" } : c)),
  );
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState<BoardCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const targetsOf = (card: BoardCard) => [...(card.canRetry ? ["approved"] : []), ...(moves[card.status] ?? [])].filter((t) => t !== card.status);
  /** Where a card dropped on a column goes, or null when it can't go there. */
  const dropTarget = (card: BoardCard, col: BoardColumn) =>
    [col.target ?? []].flat().find((t) => t !== card.status && targetsOf(card).includes(t)) ?? null;
  const send = (card: BoardCard, to: string) => {
    setError(null);
    startTransition(async () => {
      move({ id: card.id, to });
      const err = await moveApplicationAction(card.id, to);
      if (err) setError(`${card.title}: ${err}`);
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className={cn("flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2", NO_SCROLLBAR)}>
        {columns.map((col) => {
          const list = shown.filter((c) => col.statuses.includes(c.status));
          const to = dragging ? dropTarget(dragging, col) : null;
          return (
            <section
              key={col.key}
              aria-label={col.label}
              onDragOver={(e) => {
                if (to) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging && to) send(dragging, to);
                setDragging(null);
              }}
              className={cn(
                "flex w-72 shrink-0 flex-col rounded-xl border border-t-4 bg-muted/40 transition-colors md:min-h-0",
                ACCENTS[col.accent].lane,
                dragging && (to ? "border-primary/60 bg-primary/5" : "opacity-50"),
              )}
            >
              <h2 className="flex items-center justify-between px-3 pt-3 pb-2 text-sm font-semibold">
                {col.label}
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", ACCENTS[col.accent].count)}>{list.length}</span>
              </h2>
              <div className={cn("flex flex-col gap-2 overflow-y-auto px-2 pb-2", NO_SCROLLBAR)}>
                {list.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">{dragging && to ? "Drop here" : "None"}</p>}
                {list.map((c) => {
                  const targets = targetsOf(c);
                  return (
                    <article
                      key={c.id}
                      draggable={targets.length > 0}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        setDragging(c);
                      }}
                      onDragEnd={() => setDragging(null)}
                      className={cn(
                        "flex flex-col gap-1 rounded-lg border border-l-4 bg-card p-3 text-sm shadow-xs",
                        ACCENTS[col.accent].card,
                        targets.length > 0 && "cursor-grab active:cursor-grabbing",
                        col.muted && "opacity-70",
                      )}
                    >
                      <Link href={`/app/applications/${c.id}`} className="font-medium leading-snug hover:underline">{c.title}</Link>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                        {c.company}
                        {c.badge}
                      </div>
                      <p className="text-xs text-muted-foreground">{c.line}</p>
                      {(c.applyUrl || targets.length > 0) && (
                        <div className="mt-1 flex items-center justify-between gap-2">
                          {c.applyUrl ? (
                            <a href={c.applyUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">
                              Apply ↗
                            </a>
                          ) : <span />}
                          {targets.length > 0 && (
                            <select
                              aria-label={`Move ${c.title}`}
                              value=""
                              onChange={(e) => e.target.value && send(c, e.target.value)}
                              className="h-7 max-w-32 min-w-0 rounded-md border bg-background px-1.5 text-xs text-muted-foreground"
                            >
                              <option value="">Move to…</option>
                              {targets.map((t) => <option key={t} value={t}>{TARGET_LABEL[t] ?? t}</option>)}
                            </select>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
