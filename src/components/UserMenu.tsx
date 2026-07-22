"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { ChevronDownIcon, LogOutIcon, SettingsIcon } from "./icons";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export function UserMenu({
  userName,
  userRole,
  avatarUrl,
}: {
  userName: string;
  userRole: string;
  avatarUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm hover:bg-surface dark:hover:bg-white/5"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100 text-xs font-semibold text-primary-700 dark:bg-primary/20 dark:text-primary-100">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/files/${avatarUrl}`} alt="" className="h-full w-full object-cover" />
          ) : (
            initials(userName)
          )}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-medium text-ink-900 dark:text-white">{userName}</span>
          <span className="block text-xs text-ink-500 dark:text-white/40">{userRole}</span>
        </span>
        <ChevronDownIcon className="h-4 w-4 text-ink-400 dark:text-white/40" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-md border border-ink-400/15 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-ink-800">
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-ink-700 hover:bg-surface dark:text-white/80 dark:hover:bg-white/5"
          >
            <SettingsIcon className="h-4 w-4 text-ink-400 dark:text-white/40" />
            Settings
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-danger hover:bg-danger-50 dark:hover:bg-danger/10"
          >
            <LogOutIcon className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
