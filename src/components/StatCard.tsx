import Link from "next/link";

type Tone = "primary" | "info" | "warning" | "danger";

const toneClass: Record<Tone, string> = {
  primary: "bg-primary",
  info: "bg-info",
  warning: "bg-warning",
  danger: "bg-danger",
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
      className={`${toneClass[tone]} flex items-center justify-between rounded-lg p-5 text-white shadow-card transition-transform hover:-translate-y-0.5`}
    >
      <div>
        <p className="text-2xl font-semibold leading-tight">{value}</p>
        <p className="text-sm text-white/85">{label}</p>
      </div>
      <div className="text-white/70">{icon}</div>
    </Link>
  );
}
