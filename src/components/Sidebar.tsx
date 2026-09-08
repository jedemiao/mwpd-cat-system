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
  ClockIcon,
  TargetIcon,
  FolderIcon,
  FileIcon,
  ScaleIcon,
  PhoneIcon,
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
  splitIncomingLedgers,
  tracksInternalMemos,
  tracksDtr,
  tracksDipcr,
  tracksIpcrRatingGuide,
  tracksLegalAssistance,
  tracksRegulationLicensing,
  tracksSena,
  tracksCallLog,
}: {
  overdue: number;
  dueSoon: number;
  /** The signed-in user's own office — every unit sees its own name here, never another's. */
  officeName: string;
  officeCode: string;
  /** Whether this office reaches internal and external as two separate ledgers. */
  splitIncomingLedgers: boolean;
  /** Whether this office keeps an internal memorandum register at all. */
  tracksInternalMemos: boolean;
  /** Whether this office keeps the DTR filing register at all. */
  tracksDtr: boolean;
  /** Whether this office keeps a D/IPCR performance commitment at all. */
  tracksDipcr: boolean;
  /** Whether this office keeps a written IPCR rating scale at all. */
  tracksIpcrRatingGuide: boolean;
  /** Whether this office's lawyers keep the Legal Assistance register. */
  tracksLegalAssistance: boolean;
  /** Whether this office runs the regulation and licensing desk. */
  tracksRegulationLicensing: boolean;
  /** Whether this office runs SENA conciliation and keeps its conference register. */
  tracksSena: boolean;
  /** Whether this office keeps the telephone call log. */
  tracksCallLog: boolean;
}) {
  const pathname = usePathname();
  // Internal and External are the same route distinguished only by ?origin, so
  // highlighting the right sub-entry needs the query string, not just the path.
  const currentOrigin = useSearchParams().get("origin") ?? "";
  const [collapsed, setCollapsed] = useState(false);

  // Same truncation the outgoing routing prefix uses
  // (src/lib/documentTypeCodes.ts). No office carries a suffix today — MWPTD
  // was renamed from "MWPTD-CARAGA" on 2026-09-08 — so this is a no-op for
  // every current code, kept because a regional suffix is exactly the shape a
  // later unit might arrive with.
  const shortCode = officeCode.split("-")[0];

  const items: NavItem[] = [
    { href: "/", label: "Dashboard", icon: <GridIcon className="h-[18px] w-[18px]" /> },
    {
      href: "/incoming",
      label: "Incoming",
      icon: <InboxIcon className="h-[18px] w-[18px]" />,
      badge: overdue > 0 ? { count: overdue, tone: "danger" } : dueSoon > 0 ? { count: dueSoon, tone: "warning" } : null,
      // Only where the office keeps internal and external as two separate
      // ledgers, each with its own numbering run (Office.splitIncomingLedgers).
      // These are the same route with the source preset rather than duplicated
      // pages — per the adoption plan's "column plus a filter, not a second
      // page" — but they are presented as the two destinations those staff
      // actually think in.
      //
      // For an office with one ledger they are omitted entirely rather than
      // left as shortcuts: alongside the separate "Internal" module further
      // down this same nav, a second "Internal" entry nested under Incoming was
      // two different things wearing one word.
      children: splitIncomingLedgers
        ? [
            { href: "/incoming?origin=INTERNAL", label: "Internal" },
            { href: "/incoming?origin=EXTERNAL", label: "External" },
          ]
        : undefined,
    },
    { href: "/outgoing", label: "Outgoing", icon: <SendIcon className="h-[18px] w-[18px]" /> },
    // Directly after Outgoing, which is where the office's own tab order puts
    // it: a SENA case is what a correspondence complaint turns into, so the
    // conciliation register reads as the next step rather than a separate world.
    ...(tracksSena
      ? [{ href: "/sena", label: "SENA", icon: <ScaleIcon className="h-[18px] w-[18px]" /> }]
      : []),
    { href: "/activities", label: "Monthly activity", icon: <ClipboardListIcon className="h-[18px] w-[18px]" /> },
    { href: "/leave", label: "Leave", icon: <UsersIcon className="h-[18px] w-[18px]" /> },
    // Beside Leave: both are staff-roster records rather than correspondence,
    // and someone checking who is out is next to someone checking who has filed.
    ...(tracksDtr
      ? [{ href: "/dtr", label: "DTR filing", icon: <ClockIcon className="h-[18px] w-[18px]" /> }]
      : []),
    // The internal memorandum register is MWPTD's; an office that keeps none
    // has the entry omitted rather than shown leading to an empty ledger.
    ...(tracksInternalMemos
      ? [{ href: "/internal", label: "Internal", icon: <ArchiveIcon className="h-[18px] w-[18px]" /> }]
      : []),
    // Last of the records modules, before Forms: the D/IPCR is the summary the
    // others feed, so it reads after them rather than among them.
    ...(tracksDipcr
      ? [{ href: "/dipcr", label: "D/IPCR", icon: <TargetIcon className="h-[18px] w-[18px]" /> }]
      : []),
    // Sits directly under the D/IPCR because it is read against it: the
    // scale on this page is what a figure on that one gets scored by. Its
    // own flag, though — see officeTracksIpcrRatingGuide.
    ...(tracksIpcrRatingGuide
      ? [{ href: "/ipcr-rating-guide", label: "IPCR Rating Guide", icon: <FileIcon className="h-[18px] w-[18px]" /> }]
      : []),
    // Sits with the other client-facing registers rather than the internal
    // paperwork above: this one records people walked through the door, the
    // way SENA and the call log do.
    ...(tracksLegalAssistance
      ? [{ href: "/legal-assistance", label: "Legal assistance", icon: <UsersIcon className="h-[18px] w-[18px]" /> }]
      : []),
    // Beside legal assistance: the other desk the public walks up to, and the
    // office keeps the two registers side by side in the same workbook.
    ...(tracksRegulationLicensing
      ? [{ href: "/regulation-licensing", label: "Regulation and Licensing", icon: <ClipboardListIcon className="h-[18px] w-[18px]" /> }]
      : []),
    // Last of the registers, as it is in the office's own tabs, and before
    // Forms: the call log records enquiries that mostly end in the call itself
    // rather than entering any of the ledgers above.
    ...(tracksCallLog
      ? [{ href: "/call-log", label: "Call log", icon: <PhoneIcon className="h-[18px] w-[18px]" /> }]
      : []),
    { href: "/forms", label: "Forms", icon: <FolderIcon className="h-[18px] w-[18px]" /> },
  ];

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col bg-day text-dayfg dress-surface transition-[width] duration-200 print:hidden ${
        collapsed ? "w-[68px]" : "w-60"
      }`}
    >
      <div className={`flex h-16 items-center gap-2.5 border-b border-dayfg/10 ${collapsed ? "justify-center px-2" : "px-5"}`}>
        {/* Stays white on every day: this is the seal's medallion, and the logo
            is a full-colour image that needs a light backing to read. */}
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
          <Image src="/dmw_logo.png" alt="DMW logo" width={40} height={40} priority className="h-10 w-10" />
        </span>
        {!collapsed && (
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold tracking-tight">{shortCode} Tracker</p>
            {/* The regional office, not the division — the division is named in
                the title above and in full at the foot of the nav. */}
            <p className="font-mono text-[10px] uppercase tracking-wider text-dayfg/55">DMW · Caraga</p>
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
                  ? "border-dayfg bg-dayfg/15 text-dayfg"
                  : "border-transparent text-dayfg/70 hover:bg-dayfg/10 hover:text-dayfg"
              }`}
            >
              <span className={`flex items-center ${collapsed ? "" : "gap-3"}`}>
                <span className={`relative ${active ? "text-dayfg" : "text-dayfg/60"}`}>
                  {item.icon}
                  {collapsed && item.badge && (
                    <span className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ${item.badge.tone === "danger" ? "bg-danger" : "bg-warning"}`} />
                  )}
                </span>
                {!collapsed && item.label}
              </span>
              {/* Literal white below, not text-dayfg: the count sits on the ARTA
                  badge's own bg-danger/bg-warning pill, not on the day surface.
                  Switching it to the day colour would put dark text on a red
                  pill every Monday. */}
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
                        ? "border-dayfg bg-dayfg/10 text-dayfg"
                        : "border-transparent text-dayfg/55 hover:bg-dayfg/5 hover:text-dayfg/90"
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
        <div className="px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-dayfg/50">
          {officeName}
        </div>
      )}

      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={`flex items-center gap-3 border-t border-dayfg/10 py-4 text-sm font-medium text-dayfg/70 transition-colors hover:bg-dayfg/5 hover:text-dayfg ${
          collapsed ? "justify-center px-0" : "px-5"
        }`}
      >
        {collapsed ? <ChevronRightIcon className="h-5 w-5" /> : <ChevronLeftIcon className="h-5 w-5" />}
        {!collapsed && "Collapse"}
      </button>
    </aside>
  );
}
