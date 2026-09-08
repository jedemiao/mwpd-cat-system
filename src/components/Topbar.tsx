"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "./UserMenu";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationBell } from "./NotificationBell";

const SECTION_LABEL: Record<string, string> = {
  incoming: "Incoming",
  outgoing: "Outgoing",
  activities: "Monthly activity",
  leave: "Leave",
  internal: "Internal",
  dipcr: "D/IPCR",
  "ipcr-rating-guide": "IPCR Rating Guide",
  "legal-assistance": "Legal assistance",
  "regulation-licensing": "Regulation and Licensing",
  forms: "Forms",
  settings: "Settings",
};

function breadcrumbFor(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return ["Dashboard"];

  const [section, sub] = segments;
  const crumbs = [SECTION_LABEL[section] ?? section];
  if (sub === "new") crumbs.push("New");
  else if (sub) crumbs.push("Edit");
  return crumbs;
}

type NotificationSummary = {
  overdue: number;
  dueSoon: number;
  routedToMe: number;
  routedDocs: { id: string; routingNumber: string; documentTitle: string }[];
  forChecking: number;
  forCheckingDocs: { id: string; routingNumber: string; documentTitle: string }[];
  returnedToMe: number;
  returnedDocs: { id: string; routingNumber: string; documentTitle: string }[];
  deliveries: number;
  deliveryDocs: { id: string; routingNumber: string; documentTitle: string }[];
};

export function Topbar({
  userName,
  userRole,
  avatarUrl,
  notifications,
}: {
  userName: string;
  userRole: string;
  avatarUrl: string | null;
  notifications: NotificationSummary;
}) {
  const pathname = usePathname();
  const crumbs = breadcrumbFor(pathname);

  return (
    <header className="flex h-16 items-center justify-between border-b border-ink-400/15 bg-white px-6 font-display dark:border-white/10 dark:bg-dock print:hidden">
      <nav className="flex items-center gap-1.5 text-sm text-ink-500 dark:text-white/40">
        <Link href="/" className="hover:text-ink-900 dark:hover:text-white">
          Home
        </Link>
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="text-ink-400/50 dark:text-white/20">/</span>
            <span className={i === crumbs.length - 1 ? "font-semibold text-ink-900 dark:text-white" : ""}>{crumb}</span>
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <NotificationBell initial={notifications} />
        <UserMenu userName={userName} userRole={userRole} avatarUrl={avatarUrl} />
      </div>
    </header>
  );
}
