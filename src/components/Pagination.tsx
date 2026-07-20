import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

type PaginationProps = {
  basePath: string;
  page: number;
  totalPages: number;
  total: number;
  searchParams: Record<string, string | undefined>;
};

export function Pagination({ basePath, page, totalPages, total, searchParams }: PaginationProps) {
  function hrefForPage(targetPage: number) {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== "page") usp.set(key, value);
    }
    if (targetPage > 1) usp.set("page", String(targetPage));
    const qs = usp.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  if (total === 0) return null;

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-ink-500 dark:text-white/40">
      <span>
        Page {page} of {totalPages} <span className="text-ink-400 dark:text-white/25">({total} total)</span>
      </span>
      <div className="flex items-center gap-2">
        <Link
          href={hrefForPage(page - 1)}
          aria-disabled={page <= 1}
          className={`btn-secondary btn-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Previous
        </Link>
        <Link
          href={hrefForPage(page + 1)}
          aria-disabled={page >= totalPages}
          className={`btn-secondary btn-sm ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
        >
          Next
          <ChevronRightIcon className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
