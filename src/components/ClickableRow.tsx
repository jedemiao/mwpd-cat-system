"use client";

import { useRouter } from "next/navigation";
import type { ReactNode, MouseEvent } from "react";

/**
 * A table row that opens a record when clicked anywhere.
 *
 * The Edit link stays: it is what a keyboard user tabs to, what a screen reader
 * announces, and what middle-click opens in a new tab. This only adds the
 * pointer shortcut a clerk expects from a list of records — it does not replace
 * the link, and removing the link in favour of this would take those away.
 *
 * Clicks that land on something interactive are left alone, so opening a
 * scanned copy or pressing Delete does not also navigate to the edit page.
 */
export function ClickableRow({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();

  function handleClick(e: MouseEvent<HTMLTableRowElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, select, textarea, label")) return;

    // A click that ends a text selection is somebody copying a routing number,
    // not asking to open the record.
    if (window.getSelection()?.toString()) return;

    router.push(href);
  }

  return (
    <tr
      onClick={handleClick}
      className={`cursor-pointer transition-colors hover:bg-surface dark:hover:bg-white/5 print:cursor-auto ${className}`}
    >
      {children}
    </tr>
  );
}
