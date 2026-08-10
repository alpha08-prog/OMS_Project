import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Pagination — client-side pager.
 *
 * Pages with up to ~500 rows fetch the full list and slice it on the client
 * via `usePagination`. The companion <Pagination /> renders Prev/Next
 * controls + a small status line ("Page 2 of 7 · 11–20 of 61").
 *
 * Why client-side: most list pages here pull a full filtered/sorted dataset
 * once and keep it in memory; paging in JS avoids re-roundtripping the API
 * on every arrow click.
 */
export function usePagination<T>(items: readonly T[], pageSize = 10) {
  const [page, setPage] = useState(1);

  // Clamp page when the underlying list shrinks (e.g. filter applied)
  // — without this, `slice(60, 70)` of a 5-row array silently yields [].
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  if (safePage !== page) {
    // Defer the state update past render to avoid the "set state during
    // render" warning. queueMicrotask is the lightest way to do it.
    queueMicrotask(() => setPage(safePage));
  }

  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;

  const pageItems = useMemo(() => items.slice(start, end), [items, start, end]);

  return {
    page: safePage,
    setPage,
    totalPages,
    pageSize,
    total: items.length,
    pageItems,
    // 1-indexed inclusive range for "showing X-Y of Z" labels
    rangeStart: items.length === 0 ? 0 : start + 1,
    rangeEnd: Math.min(end, items.length),
  };
}

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  onChange: (page: number) => void;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  total,
  rangeStart,
  rangeEnd,
  onChange,
  className = "",
}: PaginationProps) {
  // Hide entirely when there's nothing to page through — avoids visual
  // noise on pages where the list happens to be short.
  if (totalPages <= 1) return null;

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t mt-3 ${className}`}
    >
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground">{rangeStart}</span>–
        <span className="font-medium text-foreground">{rangeEnd}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Server-side (cursor) pagination ────────────────────────────────────────
//
// The client-side pager above is right for pages that fetch a bounded list
// once. It is WRONG once a table can outgrow a single fetch: the page can only
// ever slice what was loaded, so a hardcoded `limit` silently becomes the
// ceiling on what the user can see at all.
//
// These two are the server-driven counterpart. They keep a stack of cursors
// instead of a page number, because a keyset cursor only knows how to move one
// page at a time — which is also why there is no "jump to page N": the stack
// is an honest record of pages actually traversed. To reach the far end of a
// table, flip the sort instead; the last row of a newest-first list is the
// first row of an oldest-first one.

/**
 * Cursor stack for server-paged lists.
 *
 * `resetDeps` MUST list every filter/search/sort value. A cursor is only
 * meaningful against the query that produced it — splicing a stale cursor onto
 * a changed filter set is the characteristic cursor-pagination bug, and this
 * reset is the only thing preventing it.
 */
export function useCursorPager(resetDeps: unknown[]) {
  // [null] = first page. Each Next pushes the cursor that fetched the new page.
  const [stack, setStack] = useState<(string | null)[]>([null]);

  const cursor = stack[stack.length - 1];
  const pageIndex = stack.length; // 1-based; pages actually traversed

  useEffect(() => {
    setStack([null]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetDeps);

  return {
    cursor,
    pageIndex,
    canPrev: stack.length > 1,
    next: (c: string) => setStack((s) => [...s, c]),
    prev: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    reset: () => setStack([null]),
  };
}

interface CursorPaginationProps {
  pageIndex: number;
  /** Rows on this page. */
  count: number;
  canPrev: boolean;
  hasNext: boolean;
  /** Real total, when the server could compute one. */
  total?: number;
  totalKnown?: boolean;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}

export function CursorPagination({
  pageIndex,
  count,
  canPrev,
  hasNext,
  total,
  totalKnown,
  onPrev,
  onNext,
  className = "",
}: CursorPaginationProps) {
  // NOTE: deliberately no `if (totalPages <= 1) return null` equivalent here.
  // On a server-paged list, a single full page with more behind it is the
  // COMMON case — hiding the control there would strand the user on page 1
  // with no way forward, which is the very bug this replaces.
  if (!canPrev && !hasNext) return null;

  const showTotal = totalKnown !== false && typeof total === "number";

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t mt-3 ${className}`}
    >
      <p className="text-xs text-muted-foreground">
        {showTotal ? (
          <>
            Showing <span className="font-medium text-foreground">{count}</span> of{" "}
            <span className="font-medium text-foreground">{total.toLocaleString()}</span>
          </>
        ) : (
          <>
            Showing <span className="font-medium text-foreground">{count}</span>
            {hasNext ? " (more available)" : ""}
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          Page {pageIndex}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={!hasNext}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
