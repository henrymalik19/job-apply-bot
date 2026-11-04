import { cn } from "@/shared/cn";

/** A gray placeholder block that pulses while the real content loads. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}
