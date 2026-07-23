import Link from "next/link";

type Tone = "primary" | "info" | "warning" | "danger";

// Left-rule color per tone — index-card tabs, not solid KPI-tile fills.
const ruleClass: Record<Tone, string> = {
  primary: "border-l-civic",
  info: "border-l-info",
  warning: "border-l-warning",
  danger: "border-l-danger",
};

const iconToneClass: Record<Tone, string> = {
  primary: "text-civic-300",
  info: "text-info",
  warning: "text-warning",
  danger: "text-danger",
};

export function StatCard({
  value,
  label,
  href,
  tone,
  icon,
}: {
  value: number | string;
  label: string;
  href: string;
  tone: Tone;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`${ruleClass[tone]} card flex items-center justify-between border-l-[3px] p-5 transition-colors hover:bg-surface dark:hover:bg-white/[0.03]`}
    >
      <div>
        <p className="font-mono text-2xl font-semibold leading-tight text-ink-900 dark:text-white">{value}</p>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500 dark:text-white/40">{label}</p>
      </div>
      <div className={iconToneClass[tone]}>{icon}</div>
    </Link>
  );
}
