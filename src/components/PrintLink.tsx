import Link from "next/link";
import { PrinterIcon } from "./icons";

// Builds a list page's print-view href: the current path plus every active
// filter, minus pagination. `page` is deliberately dropped — the print view
// renders the whole filtered result set, so carrying a page number over would
// silently print one screen's worth of a ledger the clerk expected in full.
export function printHref(basePath: string, searchParams: Record<string, string | undefined>) {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value && key !== "page" && key !== "print") usp.set(key, value);
  }
  usp.set("print", "1");
  return `${basePath}?${usp.toString()}`;
}

// The inverse: the same filters without `print`, for "Back to list". Kept here
// so the two stay in step — a Back link that dropped a filter would silently
// dump the clerk back into the unfiltered ledger.
export function listHref(basePath: string, searchParams: Record<string, string | undefined>) {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value && key !== "page" && key !== "print") usp.set(key, value);
  }
  const qs = usp.toString();
  return `${basePath}${qs ? `?${qs}` : ""}`;
}

// Server component — this is just a link, no client JS needed to reach the
// print view. The dialog itself is opened by PrintToolbar once that view loads.
export function PrintLink({
  basePath,
  searchParams,
}: {
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  return (
    <Link href={printHref(basePath, searchParams)} className="btn-secondary print:hidden">
      <PrinterIcon className="h-4 w-4" />
      Print
    </Link>
  );
}
