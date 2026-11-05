"use client";

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Clock, Ellipsis } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/shared/cn";
import { TONE_BADGE, type Tone } from "../../_components/status";
import { moveApplicationAction } from "../applications/actions";

/** One application as a card; `badge` is the site badge, rendered on the server. */
export type BoardCard = {
  id: string;
  status: string;
  title: string;
  company: string;
  badge: ReactNode;
  /** Where it stands: the runner's progress, why it's stuck, or how long it has been here. */
  note: CardNote;
  /** Approved on a site the runner can't fill, or stuck: where to apply. */
  applyUrl?: string | null;
  /** Stuck, and the apply runner can try it again (moving it to Approved). */
  canRetry?: boolean;
};

/**
 * A card's status pill: `text` is short; `detail`, when given, opens on hover or tap.
 * `since` shows a clock, for "how long it has been in this lane".
 */
export type CardNote = { text: string; detail?: string; tone: Tone; since?: boolean };

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
  no_reply: "No reply",
  expired: "Closed (posting gone)",
};

/**
 * Post-approval applications as columns. Drag a card to another column (on a
 * phone, press and hold it first), or use its Move menu, to record that you
 * applied, heard back, got an interview, an offer or a no; only moves the
 * database allows are offered. Dragging near the board's edge scrolls it.
 */
export function Board({ columns, cards, moves }: { columns: BoardColumn[]; cards: BoardCard[]; moves: Record<string, string[]> }) {
  const [shown, move] = useOptimistic(cards, (list, m: { id: string; to: string }) =>
    list.map((c) => (c.id === m.id ? { ...c, status: m.to, note: { text: "Moving…", tone: "info" as const } } : c)),
  );
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState<BoardCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(
    // A small move starts a drag, so clicking the title, Apply or the Move menu still works.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Press and hold on touch, so a swipe still scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

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

  const onDragStart = (e: DragStartEvent) => setDragging(shown.find((c) => c.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    const col = columns.find((c) => c.key === e.over?.id);
    const to = dragging && col ? dropTarget(dragging, col) : null;
    if (dragging && to) send(dragging, to);
    setDragging(null);
  };

  return (
    // A fixed id keeps dnd-kit's accessibility ids the same on the server and in the browser.
    <DndContext id="applying-board" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className={cn("flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2", NO_SCROLLBAR)}>
          {columns.map((col) => {
            const list = shown.filter((c) => col.statuses.includes(c.status));
            const to = dragging ? dropTarget(dragging, col) : null;
            return (
              <Lane key={col.key} col={col} count={list.length} state={dragging ? (to ? "open" : "closed") : "idle"}>
                {list.map((c) => (
                  <DraggableCard key={c.id} card={c} accent={col.accent} muted={col.muted} targets={targetsOf(c)} onMove={(t) => send(c, t)} />
                ))}
              </Lane>
            );
          })}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging && <CardBody card={dragging} accent={columns.find((c) => c.statuses.includes(dragging.status))?.accent ?? "zinc"} lifted />}
      </DragOverlay>
    </DndContext>
  );
}

/** One column; while a card is dragged it shows whether the card can be dropped here. */
function Lane({ col, count, state, children }: { col: BoardColumn; count: number; state: "idle" | "open" | "closed"; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key, disabled: state === "closed" });
  return (
    <section
      ref={setNodeRef}
      aria-label={col.label}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border border-t-4 bg-muted/40 transition-colors md:min-h-0",
        ACCENTS[col.accent].lane,
        state === "open" && (isOver ? "border-primary bg-primary/10" : "border-primary/50 bg-primary/5"),
        state === "closed" && "opacity-50",
      )}
    >
      <h2 className="flex items-center justify-between px-3 pt-3 pb-2 text-sm font-semibold">
        {col.label}
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", ACCENTS[col.accent].count)}>{count}</span>
      </h2>
      <div className={cn("flex flex-col gap-2 overflow-y-auto px-2 pb-2", NO_SCROLLBAR)}>
        {count === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">{state === "open" ? "Drop here" : "None"}</p>}
        {children}
      </div>
    </section>
  );
}

/** A card you can pick up when it has somewhere to go; it stays in place, faded, while its copy moves. */
function DraggableCard(props: { card: BoardCard; accent: Accent; muted?: boolean; targets: string[]; onMove: (to: string) => void }) {
  const { card, targets } = props;
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: card.id, disabled: targets.length === 0 });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-manipulation", isDragging && "opacity-30")}>
      <CardBody {...props} />
    </div>
  );
}

/** What a card shows; `lifted` is the copy that follows the pointer. */
function CardBody({ card, accent, muted, targets = [], onMove, lifted }: {
  card: BoardCard;
  accent: Accent;
  muted?: boolean;
  targets?: string[];
  onMove?: (to: string) => void;
  lifted?: boolean;
}) {
  return (
    <article
      className={cn(
        "flex flex-col gap-1 rounded-lg border border-l-4 bg-card p-3 text-sm shadow-xs",
        ACCENTS[accent].card,
        targets.length > 0 && "cursor-grab",
        muted && "opacity-70",
        lifted && "w-68 cursor-grabbing shadow-lg ring-1 ring-primary/30",
      )}
    >
      <Link href={`/app/applications/${card.id}?from=applying`} draggable={false} className="font-medium leading-snug hover:underline">{card.title}</Link>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
        {card.company}
        {card.badge}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <Note note={card.note} />
        {card.applyUrl && (
          <a href={card.applyUrl} target="_blank" rel="noreferrer" draggable={false} className="shrink-0 text-xs font-medium text-primary hover:underline">
            Apply ↗
          </a>
        )}
        {targets.length > 0 && onMove && <MoveMenu title={card.title} targets={targets} onMove={onMove} />}
      </div>
    </article>
  );
}

/** The status pill; a long one is cut to a line and shows in full on hover or tap. */
function Note({ note }: { note: CardNote }) {
  const pill = (
    <span className={cn("inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-xs font-medium", TONE_BADGE[note.tone])}>
      {note.since && <Clock className="size-3 shrink-0" />}
      <span className="truncate">{note.text}</span>
    </span>
  );
  if (!note.detail) return <span className="mr-auto min-w-0">{pill}</span>;
  return (
    <Popover>
      <PopoverTrigger openOnHover delay={150} className="mr-auto min-w-0 text-left">{pill}</PopoverTrigger>
      <PopoverContent side="top" className="w-64 text-xs leading-relaxed">{note.detail}</PopoverContent>
    </Popover>
  );
}

/** Where a card can go, for keyboards and small screens; dragging does the same. */
function MoveMenu({ title, targets, onMove }: { title: string; targets: string[]; onMove: (to: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Move ${title}`}
        // Opening the menu isn't the start of a drag.
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className="ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Ellipsis className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 gap-0.5 p-1">
        <p className="px-2 py-1 text-xs text-muted-foreground">Move to</p>
        {targets.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setOpen(false);
              onMove(t);
            }}
            className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
          >
            {TARGET_LABEL[t] ?? t}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
