"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  GridIcon,
  InboxIcon,
  SendIcon,
  ClipboardListIcon,
  UsersIcon,
  ArchiveIcon,
  FolderIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "./icons";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: { count: number; tone: "danger" | "warning" } | null;
  /** Rendered indented beneath the parent. Used for the Internal/External split
   *  of Incoming, which is one page filtered two ways rather than two routes. */
  children?: { href: string; label: string }[];
};

export function Sidebar({
  overdue,
  dueSoon,
  officeName,
  officeCode,
}: {
  overdue: number;
  dueSoon: number;
  /** The signed-in user's own office — every unit sees its own name here, never another's. */
  officeName: string;
  officeCode: string;
}) {
  const pathname = usePathname();
  // Internal and External are the same route distinguished only by ?origin, so
  // highlighting the right sub-entry needs the query string, not just the path.
  const currentOrigin = useSearchParams().get("origin") ?? "";
  const [collapsed, setCollapsed] = useState(false);

  // Same truncation the outgoing routing prefix uses (src/lib/documentTypeCodes.ts):
  // the seeded office is coded "MWPTD-CARAGA" but signs itself "MWPTD", and the
  // units onboarded later ("FAD", "WRSD") have no suffix to strip.
  const shortCode = officeCode.split("-")[0];

  const items: NavItem[] = [
    { href: "/", label: "Dashboard", icon: <GridIcon className="h-[18px] w-[18px]" /> },
    {
      href: "/incoming",
      label: "Incoming",
      icon: <InboxIcon className="h-[18px] w-[18px]" />,
      badge: overdue > 0 ? { count: overdue, tone: "danger" } : dueSoon > 0 ? { count: dueSoon, tone: "warning" } : null,
      // The office keeps internal and external as two separate ledgers, each
      // with its own numbering run, and reaches them as two nav items. These
      // are the same route with the source preset rather than duplicated pages
      // — per the adoption plan's "column plus a filter, not a second page" —
      // but they are presented as the two destinations staff actually think in.
      children: [
        { href: "/incoming?origin=INTERNAL", label: "Internal" },
        { href: "/incoming?origin=EXTERNAL", label: "External" },
      ],
    },
    { href: "/outgoing", label: "Outgoing", icon: <SendIcon className="h-[18px] w-[18px]" /> },
    { href: "/activities", label: "Monthly activity", icon: <ClipboardListIcon className="h-[18px] w-[18px]" /> },
    { href: "/leave", label: "Leave", icon: <UsersIcon className="h-[18px] w-[18px]" /> },
    { href: "/internal", label: "Internal", icon: <ArchiveIcon className="h-[18px] w-[18px]" /> },
    { href: "/forms", label: "Forms", icon: <FolderIcon className="h-[18px] w-[18px]" /> },
  ];

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col bg-primary text-white transition-[width] duration-200 print:hidden ${
        collapsed ? "w-[68px]" : "w-60"
      }`}
    >
      <div className={`flex h-16 items-center gap-2.5 border-b border-white/10 ${collapsed ? "justify-center px-2" : "px-5"}`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
          <Image src="/dmw_logo.png" alt="DMW logo" width={40} height={40} priority className="h-10 w-10" />
        </span>
        {!collapsed && (
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold tracking-tight">{shortCode} Tracker</p>
            {/* The regional office, not the division — the division is named in
                the title above and in full at the foot of the nav. */}
            <p className="font-mono text-[10px] uppercase tracking-wider text-white/45">DMW · Caraga</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <div key={item.href}>
            <Link
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`relative flex items-center border-l-2 py-2 text-sm transition-colors ${
                collapsed ? "justify-center border-l-0 px-0" : "justify-between px-3"
              } ${
                active
                  ? "border-white bg-white/15 text-white"
                  : "border-transparent text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className={`flex items-center ${collapsed ? "" : "gap-3"}`}>
                <span className={`relative ${active ? "text-white" : "text-white/60"}`}>
                  {item.icon}
                  {collapsed && item.badge && (
                    <span className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ${item.badge.tone === "danger" ? "bg-danger" : "bg-warning"}`} />
                  )}
                </span>
                {!collapsed && item.label}
              </span>
              {!collapsed && item.badge && (
                <span
                  className={`rounded-full px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none text-white ${
                    item.badge.tone === "danger" ? "bg-danger" : "bg-warning"
                  }`}
                >
                  {item.badge.count}
                </span>
              )}
            </Link>

            {/* Sub-entries are hidden when collapsed — at 68px there is no room
                for a second level, and the parent icon still reaches the page. */}
            {!collapsed &&
              item.children?.map((child) => {
                const childOrigin = child.href.split("origin=")[1];
                const childActive = pathname === item.href && currentOrigin === childOrigin;
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    className={`flex items-center border-l-2 py-1.5 pl-12 pr-3 text-[13px] transition-colors ${
                      childActive
                        ? "border-white bg-white/10 text-white"
                        : "border-transparent text-white/55 hover:bg-white/5 hover:text-white/90"
                    }`}
                  >
                    {child.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-white/35">
          {officeName}
        </div>
      )}

      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={`flex items-center gap-3 border-t border-white/10 py-4 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white ${
          collapsed ? "justify-center px-0" : "px-5"
        }`}
      >
        {collapsed ? <ChevronRightIcon className="h-5 w-5" /> : <ChevronLeftIcon className="h-5 w-5" />}
        {!collapsed && "Collapse"}
      </button>
    </aside>
  );
}
