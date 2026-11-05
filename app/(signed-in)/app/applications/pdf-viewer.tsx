"use client";

import { ExternalLink, FileText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * A "View resume" button that shows the PDF over the page (Esc or the X closes it), with
 * "Open in new tab" for a full window or a phone that only shows the first page inline.
 */
export function PdfViewer({ url, title }: { url: string; title: string }) {
  const [open, setOpen] = useState(false);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Focus starts on Close, so Esc works until you click into the PDF.
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      <Button variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        <FileText /> View resume
      </Button>
      {/* On the page's body, so the sticky header and side columns can't cover it. */}
      {open && createPortal(
        <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex flex-col bg-black/85" onClick={() => setOpen(false)}>
          <div className="flex items-center gap-2 px-4 py-3 text-sm text-white" onClick={(e) => e.stopPropagation()}>
            <span className="truncate font-medium">{title}</span>
            <a href={url} target="_blank" rel="noreferrer" className="ml-auto inline-flex shrink-0 items-center gap-1 text-white/70 hover:text-white">
              <ExternalLink className="size-4" /> Open in new tab
            </a>
            <Button ref={close} size="icon" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" aria-label="Close" onClick={() => setOpen(false)}>
              <X />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 justify-center px-2 pb-4 sm:px-12" onClick={(e) => e.stopPropagation()}>
            <iframe src={url} title={title} className="h-full w-full max-w-4xl rounded bg-white shadow-2xl" />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
