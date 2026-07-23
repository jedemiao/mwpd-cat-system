"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
};

export function Sidebar({ overdue, dueSoon }: { overdue: number; dueSoon: number }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const items: NavItem[] = [
    { href: "/", label: "Dashboard", icon: <GridIcon className="h-[18px] w-[18px]" /> },
    {
      href: "/incoming",
      label: "Incoming",
      icon: <InboxIcon className="h-[18px] w-[18px]" />,
      badge: overdue > 0 ? { count: overdue, tone: "danger" } : dueSoon > 0 ? { count: dueSoon, tone: "warning" } : null,
    },
    { href: "/outgoing", label: "Outgoing", icon: <SendIcon className="h-[18px] w-[18px]" /> },
    { href: "/activities", label: "Monthly activity", icon: <ClipboardListIcon className="h-[18px] w-[18px]" /> },
    { href: "/leave", label: "Leave", icon: <UsersIcon className="h-[18px] w-[18px]" /> },
    { href: "/internal", label: "Internal", icon: <ArchiveIcon className="h-[18px] w-[18px]" /> },
    { href: "/forms", label: "Forms", icon: <FolderIcon className="h-[18px] w-[18px]" /> },
  ];

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col bg-dock text-white transition-[width] duration-200 ${
        collapsed ? "w-[68px]" : "w-60"
      }`}
    >
      <div className={`flex h-16 items-center gap-2.5 border-b border-white/10 ${collapsed ? "justify-center px-2" : "px-5"}`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
          <Image src="/dmw_logo.png" alt="DMW logo" width={40} height={40} priority className="h-10 w-10" />
        </span>
        {!collapsed && (
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold tracking-tight">MWPtD Tracker</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-white/45">DMW · Protection Div.</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`relative flex items-center border-l-2 py-2 text-sm transition-colors ${
                collapsed ? "justify-center border-l-0 px-0" : "justify-between px-3"
              } ${
                active
                  ? "border-civic-400 bg-white/[0.06] text-white"
                  : "border-transparent text-white/60 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <span className={`flex items-center ${collapsed ? "" : "gap-3"}`}>
                <span className={`relative ${active ? "text-civic-300" : "text-white/45"}`}>
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
          );
        })}
      </nav>

      {!collapsed && (
        <div className="px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-white/35">
          Migrant Workers Protection Division
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
