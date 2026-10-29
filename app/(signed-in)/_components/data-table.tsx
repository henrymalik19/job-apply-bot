import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/shared/cn";
import type { Page } from "@/shared/paginate";

/**
 * Classes for a table that scrolls inside its card. On desktop the card fills
 * the rest of the screen and the table takes the space left in it, so the page
 * itself does not scroll; on small screens the table is capped at 70% of the
 * viewport. The header row sticks while the rows scroll.
 */
export const scrollingTable = {
  card: "md:min-h-[16rem] md:flex-1",
  content: "flex min-h-0 flex-1 flex-col",
  container: "max-h-[70vh] min-h-0 flex-1 overflow-auto rounded-md border md:max-h-none",
  header: "sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--border)] [&_th]:bg-card",
};

/**
 * "1–50 of 304" with Previous/Next links. Links keep the path and any other
 * search params (filters) and change only `?page=`, so reloads and the back
 * button work.
 *
 * @param basePath - The page's path, e.g. `/app/companies`.
 * @param params - Search params to keep on every link (e.g. active filters).
 */
export function Pager({
  page,
  basePath,
  params = {},
}: {
  page: Page<unknown>;
  basePath: string;
  params?: Record<string, string>;
}) {
  if (page.total === 0) return null;
  const href = (n: number) => {
    const qs = new URLSearchParams(params);
    if (n > 1) qs.set("page", String(n));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const link = buttonVariants({ variant: "outline", size: "sm" });
  const disabled = "pointer-events-none opacity-50";

  return (
    <div className="flex items-center justify-between gap-4 pt-3 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {page.from.toLocaleString()}–{page.to.toLocaleString()} of {page.total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        <Link
          href={href(page.page - 1)}
          aria-disabled={page.page <= 1}
          tabIndex={page.page <= 1 ? -1 : undefined}
          className={cn(link, page.page <= 1 && disabled)}
        >
          <ChevronLeft aria-hidden /> Previous
        </Link>
        <span className="tabular-nums">
          Page {page.page} of {page.pageCount}
        </span>
        <Link
          href={href(page.page + 1)}
          aria-disabled={page.page >= page.pageCount}
          tabIndex={page.page >= page.pageCount ? -1 : undefined}
          className={cn(link, page.page >= page.pageCount && disabled)}
        >
          Next <ChevronRight aria-hidden />
        </Link>
      </div>
    </div>
  );
}
