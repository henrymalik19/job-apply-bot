"use client";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** A small (i) that explains something on hover, focus or tap. */
export function InfoTip({ children, label = "What's this?" }: { children: React.ReactNode; label?: string }) {
  return (
    <Popover>
      <PopoverTrigger openOnHover delay={150} aria-label={label} className="inline-flex text-muted-foreground hover:text-foreground">
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent side="top" className="w-64 text-xs leading-relaxed">{children}</PopoverContent>
    </Popover>
  );
}
