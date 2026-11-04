import { cn } from "@/shared/cn";

/** The Jobrx mark: "Rx" on an indigo square, with the name beside it unless `markOnly`. */
export function Logo({ className, markOnly = false }: { className?: string; markOnly?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#6366f1] text-[0.8rem] font-bold tracking-tighter text-white">Rx</span>
      {!markOnly && <span>Jobrx</span>}
    </span>
  );
}
