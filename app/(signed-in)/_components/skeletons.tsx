// Page-shaped placeholders shown while a page's data loads, instead of a bare "Loading…".
// Each roughly matches its page's layout so nothing jumps when the content arrives.
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Announces the wait to screen readers; the shapes themselves are hidden from them. */
function Loading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

/** Rows of a table inside a card, optionally under a row of tabs. */
export function TableSkeleton({ rows = 8, tabs = 0 }: { rows?: number; tabs?: number }) {
  return (
    <Loading className="flex flex-col gap-4">
      {tabs > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: tabs }, (_, i) => <Skeleton key={i} className="h-8 w-32" />)}
        </div>
      )}
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-2/3 max-w-md" />
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-4 py-3">
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4" style={{ width: `${45 + ((i * 17) % 35)}%` }} />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="hidden h-5 w-24 sm:block" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </CardContent>
      </Card>
    </Loading>
  );
}

/** The Applying board: a summary line and lanes of cards. */
export function BoardSkeleton() {
  const lanes = [3, 1, 4, 2, 1, 0, 2];
  return (
    <Loading className="flex flex-col gap-4">
      <Skeleton className="h-4 w-72" />
      <div className="flex gap-4 overflow-hidden">
        {lanes.map((cards, i) => (
          <div key={i} className="flex w-72 shrink-0 flex-col gap-3 rounded-xl border border-t-4 bg-muted/40 p-3">
            <Skeleton className="h-4 w-28" />
            {Array.from({ length: cards }, (_, j) => (
              <div key={j} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** One application or job: a header, the main column of cards and a side column. */
export function DetailSkeleton() {
  return (
    <Loading className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 border-b pb-3">
        <Skeleton className="h-7 w-2/3 max-w-xl" />
        <Skeleton className="h-4 w-1/3 max-w-xs" />
      </div>
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {[4, 3, 2].map((lines, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {Array.from({ length: lines }, (_, j) => <Skeleton key={j} className="h-4" style={{ width: `${60 + ((j * 13) % 35)}%` }} />)}
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    </Loading>
  );
}

/** Overview and the public page: a row of number tiles, then a table. */
export function OverviewSkeleton() {
  return (
    <Loading className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i}>
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <TableSkeleton rows={6} />
    </Loading>
  );
}

/** Profile, Search and Settings: cards of labeled fields. */
export function FormSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <Loading className="flex flex-col gap-6">
      {Array.from({ length: cards }, (_, i) => (
        <Card key={i}>
          <CardHeader className="gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-2/3 max-w-md" />
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, j) => (
              <div key={j} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </Loading>
  );
}
