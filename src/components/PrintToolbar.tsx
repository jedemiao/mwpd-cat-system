"use client";

import { useEffect } from "react";
import Link from "next/link";
import { PrinterIcon, ChevronLeftIcon } from "./icons";

// Shown on screen at the top of a print view, never on paper.
//
// The dialog fires once on arrival: the clerk already clicked "Print" on the
// list to get here, so landing on a silent full-page table and having to reach
// for Ctrl+P would be a dead end. The buttons stay for the case where they
// dismiss the dialog and want another go, or want to get back to the ledger.
export function PrintToolbar({ backHref }: { backHref: string }) {
  useEffect(() => {
    window.print();
  }, []);

  return (
    <div className="flex items-center gap-2 print:hidden">
      <Link href={backHref} className="btn-secondary">
        <ChevronLeftIcon className="h-4 w-4" />
        Back to list
      </Link>
      <button type="button" onClick={() => window.print()} className="btn-dark">
        <PrinterIcon className="h-4 w-4" />
        Print
      </button>
    </div>
  );
}
