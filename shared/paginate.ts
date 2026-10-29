/** One page of a list plus what a pager needs to render. Pages are 1-based. */
export type Page<T> = {
  items: T[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  /** 1-based index of the first item shown (0 when empty). */
  from: number;
  /** 1-based index of the last item shown (0 when empty). */
  to: number;
};

/** Default rows per page for admin tables. */
export const DEFAULT_PAGE_SIZE = 50;

/**
 * Reads a 1-based page number from a search param. Anything missing, invalid
 * or below 1 becomes 1.
 */
export function parsePage(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * Slices one page out of a list. A page past the end is clamped to the last
 * page, so a stale `?page=9` after rows were removed still shows something.
 */
export function paginate<T>(all: T[], page: number, pageSize = DEFAULT_PAGE_SIZE): Page<T> {
  const total = all.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  const items = all.slice(start, start + pageSize);
  return {
    items,
    page: current,
    pageCount,
    pageSize,
    total,
    from: items.length ? start + 1 : 0,
    to: start + items.length,
  };
}
