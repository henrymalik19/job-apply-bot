"use client";

import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * The screenshots a run can take, in order, by the name the recorder gives the file
 * ("02-after-resume.png" is after-resume): what each shows, and why it may be missing.
 */
const SLOTS = [
  { key: "opened", label: "Opened", hint: "The form as it loaded, before anything was filled.", missing: "The form didn't open." },
  { key: "after-resume", label: "After resume", hint: "Right after the resume was attached, to check the upload took.", missing: "The run stopped before attaching the resume." },
  { key: "email-code", label: "Security code", hint: "The form asked for a code it emailed; this is the step that asked.", missing: "Not needed: the form didn't ask for an emailed code." },
  { key: "evidence", label: "Before submit", hint: "The filled form just before submitting: what was sent. Kept as evidence.", missing: "The run stopped before the form was filled." },
  { key: "end", label: "End", hint: "Where the run ended: the confirmation page, or the form as it was left.", missing: "The run was stopped (the tab closed or the runner quit) before it ended." },
] as const;

const slotKey = (name: string) => name.replace(/^\d+-/, "").replace(/\.png$/, "");

/**
 * A run's screenshots in fixed slots, one per step a run can reach; a slot it didn't
 * reach stays, greyed, saying why. One opens in a viewer over the page, with the arrow
 * keys (or buttons) for the others and Esc to close.
 */
export function Screenshots({ shots }: { shots: { name: string; url: string }[] }) {
  const byKey = new Map(shots.map((s) => [slotKey(s.name), s.url]));
  const taken = SLOTS.flatMap((slot) => (byKey.has(slot.key) ? [{ ...slot, url: byKey.get(slot.key)! }] : []));
  const [open, setOpen] = useState<number | null>(null);
  const step = (by: number) => setOpen((i) => (i == null ? i : (i + by + taken.length) % taken.length));

  useEffect(() => {
    if (open == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i == null ? i : (i + 1) % taken.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i == null ? i : (i - 1 + taken.length) % taken.length));
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, taken.length]);

  const shown = open == null ? null : taken[open];
  return (
    <>
      <div className="flex flex-wrap gap-3">
        {SLOTS.map((slot) => {
          const url = byKey.get(slot.key);
          const index = taken.findIndex((t) => t.key === slot.key);
          return url ? (
            <button key={slot.key} type="button" title={slot.hint} onClick={() => setOpen(index)} className="flex w-28 flex-col gap-1 text-left text-xs hover:text-foreground">
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URLs */}
              <img src={url} alt={`Screenshot: ${slot.label}`} className="h-36 w-28 rounded border object-cover object-top" loading="lazy" />
              <span className="font-medium">{slot.label}</span>
            </button>
          ) : (
            <div key={slot.key} title={`${slot.hint}\n\nNot taken: ${slot.missing}`} className="flex w-28 flex-col gap-1 text-xs text-muted-foreground/70">
              <div className="flex h-36 w-28 flex-col items-center justify-center gap-1 rounded border border-dashed p-2 text-center">
                <ImageOff className="size-4" />
                <span className="leading-tight">{slot.missing}</span>
              </div>
              <span>{slot.label}</span>
            </div>
          );
        })}
      </div>
      {shown && (
        <div role="dialog" aria-modal="true" aria-label={`Screenshot: ${shown.label}`} className="fixed inset-0 z-50 flex flex-col bg-black/85" onClick={() => setOpen(null)}>
          <div className="flex items-center gap-2 px-4 py-3 text-sm text-white" onClick={(e) => e.stopPropagation()}>
            <span className="font-medium">{shown.label}</span>
            <span className="text-white/60">{shown.hint}</span>
            <span className="text-white/60">· {open! + 1} of {taken.length}</span>
            <a href={shown.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex shrink-0 items-center gap-1 text-white/70 hover:text-white">
              <ExternalLink className="size-4" /> Full size
            </a>
            <Button size="icon" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" aria-label="Close" onClick={() => setOpen(null)}>
              <X />
            </Button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-start justify-center overflow-auto px-12 pb-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URLs */}
            <img src={shown.url} alt={`Screenshot: ${shown.label}`} className="max-w-full rounded shadow-2xl" onClick={(e) => e.stopPropagation()} />
          </div>
          {taken.length > 1 && (
            <>
              <Button size="icon" variant="ghost" aria-label="Previous screenshot" className="fixed top-1/2 left-2 text-white hover:bg-white/10 hover:text-white" onClick={(e) => { e.stopPropagation(); step(-1); }}>
                <ChevronLeft />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Next screenshot" className="fixed top-1/2 right-2 text-white hover:bg-white/10 hover:text-white" onClick={(e) => { e.stopPropagation(); step(1); }}>
                <ChevronRight />
              </Button>
            </>
          )}
        </div>
      )}
    </>
  );
}
