/**
 * DataPagination — a compact, reusable pagination control + hook for register
 * pages. Client-side: slices an already-fetched array so only one page of rows
 * renders at a time (faster render, far less scrolling on long lists).
 *
 * Usage:
 *   const { page, setPage, pageCount, pageItems, total, rangeLabel } =
 *     usePagination(rows, 25);
 *   ...render pageItems...
 *   <DataPagination
 *     page={page} pageCount={pageCount} total={total}
 *     rangeLabel={rangeLabel} onPageChange={setPage}
 *   />
 */
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@ndma-dcs-staff-portal/ui/lib/utils";

export interface PaginationState<T> {
  page: number;
  setPage: (p: number) => void;
  pageCount: number;
  pageItems: T[];
  total: number;
  /** e.g. "1–25 of 281" */
  rangeLabel: string;
}

/** Client-side pagination over an in-memory array. */
export function usePagination<T>(items: T[], pageSize = 25): PaginationState<T> {
  const [page, setPageRaw] = useState(1);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Clamp the page if the list shrank (e.g. after a filter change).
  const safePage = Math.min(page, pageCount);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return {
    page: safePage,
    setPage: (p: number) => setPageRaw(Math.min(Math.max(1, p), pageCount)),
    pageCount,
    pageItems,
    total,
    rangeLabel: `${from}–${to} of ${total}`,
  };
}

interface DataPaginationProps {
  page: number;
  pageCount: number;
  total: number;
  rangeLabel: string;
  onPageChange: (p: number) => void;
  className?: string;
}

export function DataPagination({
  page,
  pageCount,
  total,
  rangeLabel,
  onPageChange,
  className,
}: DataPaginationProps) {
  // Nothing to page through — render only the count for context.
  if (pageCount <= 1) {
    return total > 0 ? (
      <div
        className={cn(
          "flex items-center justify-end px-1 py-2 text-xs text-muted-foreground",
          className,
        )}
      >
        {total} {total === 1 ? "row" : "rows"}
      </div>
    ) : null;
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 px-1 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <span className="tabular-nums">{rangeLabel}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center gap-0.5 rounded-md border px-2 py-1 font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="size-3.5" />
          Prev
        </button>
        <span className="px-2 tabular-nums">
          Page {page} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          className="inline-flex items-center gap-0.5 rounded-md border px-2 py-1 font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
