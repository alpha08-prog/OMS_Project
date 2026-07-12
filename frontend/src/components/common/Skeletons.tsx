import { Skeleton } from "@/components/ui/skeleton";

/**
 * Reusable loading placeholders that mirror the shape of the content they
 * replace, so the layout doesn't jump when data arrives. Use these instead of
 * a bare "Loading…" string or centered spinner on list/table/dashboard pages.
 */

/** A vertical list of card-shaped skeleton rows (for card/queue list pages). */
export function CardListSkeleton({
  rows = 5,
  className = "",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-3 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** A table-shaped skeleton (header row + N body rows). */
export function TableSkeleton({
  rows = 6,
  cols = 5,
  className = "",
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      <div className="flex gap-4 px-1">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-1">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A grid of KPI/stat-card skeletons (for dashboard headers). */
export function StatCardsSkeleton({
  count = 4,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-2xl" />
      ))}
    </div>
  );
}
