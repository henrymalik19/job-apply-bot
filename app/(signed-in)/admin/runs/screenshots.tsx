"use client";

import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** One screenshot's name without its number: "01-opened.png" -> "opened". */
const shotName = (name: string) => name.replace(/^\d+-/, "").replace(/\.png$/, "").replace(/-/g, " ");

/**
 * A run's screenshots as thumbnails; one opens in a viewer over the page, with the
 * arrow keys (or buttons) for the others and Esc to close.
 */
export function Screenshots({ shots }: { shots: { name: string; url: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const step = (by: number) => setOpen((i) => (i == null ? i : (i + by + shots.length) % shots.length));

  useEffect(() => {
    if (open == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i == null ? i : (i + 1) % shots.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i == null ? i : (i - 1 + shots.length) % shots.length));
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, shots.length]);

  const shown = open == null ? null : shots[open];
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {shots.map((s, i) => (
          <button key={s.name} type="button" onClick={() => setOpen(i)} className="flex w-28 flex-col gap-1 text-left text-xs text-muted-foreground hover:text-foreground">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URLs */}
            <img src={s.url} alt={`Screenshot: ${shotName(s.name)}`} className="h-36 w-28 rounded border object-cover object-top" loading="lazy" />
            {shotName(s.name)}
          </button>
        ))}
      </div>
      {shown && (
        <div role="dialog" aria-modal="true" aria-label={`Screenshot: ${shotName(shown.name)}`} className="fixed inset-0 z-50 flex flex-col bg-black/85" onClick={() => setOpen(null)}>
          <div className="flex items-center gap-2 px-4 py-3 text-sm text-white" onClick={(e) => e.stopPropagation()}>
            <span className="font-medium capitalize">{shotName(shown.name)}</span>
            <span className="text-white/60">{open! + 1} of {shots.length}</span>
            <a href={shown.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-white/70 hover:text-white">
              <ExternalLink className="size-4" /> Full size
            </a>
            <Button size="icon" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" aria-label="Close" onClick={() => setOpen(null)}>
              <X />
            </Button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-start justify-center overflow-auto px-12 pb-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URLs */}
            <img src={shown.url} alt={`Screenshot: ${shotName(shown.name)}`} className="max-w-full rounded shadow-2xl" onClick={(e) => e.stopPropagation()} />
          </div>
          {shots.length > 1 && (
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
