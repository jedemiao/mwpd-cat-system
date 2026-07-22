import Link from "next/link";
import { PlusIcon } from "@/components/icons";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Cycled by assignee id so the same person always lands on the same color
// across days/months — a lightweight way to make "who's busy when" scannable
// without a legend. Colors reuse the app's existing semantic palette rather
// than introducing new ones.
const PILL_PALETTE = [
  "border-l-primary bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary/15 dark:text-primary-100 dark:hover:bg-primary/25",
  "border-l-success bg-success-50 text-success-600 hover:bg-success-50/70 dark:bg-success/15 dark:text-success dark:hover:bg-success/25",
  "border-l-warning bg-warning-50 text-[#92660c] hover:bg-warning-50/70 dark:bg-warning/15 dark:text-warning dark:hover:bg-warning/25",
  "border-l-info bg-info-50 text-info-600 hover:bg-info-50/70 dark:bg-info/15 dark:text-info dark:hover:bg-info/25",
  "border-l-secondary bg-secondary-50 text-secondary-600 hover:bg-secondary-50/70 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/15",
];
const UNASSIGNED_PILL =
  "border-l-ink-400/40 bg-surface text-ink-600 hover:bg-ink-400/10 dark:border-l-white/20 dark:bg-white/[0.04] dark:text-white/60 dark:hover:bg-white/[0.08]";

function pillClassFor(assigneeIds: string[]) {
  if (assigneeIds.length === 0) return UNASSIGNED_PILL;
  let hash = 0;
  for (const ch of assigneeIds[0]) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PILL_PALETTE[hash % PILL_PALETTE.length];
}

type CalendarActivity = {
  id: string;
  date: Date;
  activityName: string;
  assignees: { id: string; name: string }[];
};

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Builds a fixed 6-week grid (42 days) starting on the Sunday on/before the
// 1st of the month, so every month renders the same number of rows.
function buildWeeks(year: number, month: number) {
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export function ActivityCalendar({
  year,
  month,
  activities,
  extraQuery,
}: {
  year: number;
  month: number; // 0-indexed
  activities: CalendarActivity[];
  extraQuery: string; // query string fragment to preserve (e.g. "&q=inspection"), "" if none
}) {
  const weeks = buildWeeks(year, month);
  const today = new Date();
  const todayKey = dateKey(today);

  const byDay = new Map<string, CalendarActivity[]>();
  for (const activity of activities) {
    const key = dateKey(activity.date);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(activity);
  }

  const prev = month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
  const next = month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
  const monthParam = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;

  // So "New activity" launched from a day cell comes back to this same month/search.
  const returnTo = encodeURIComponent(`/activities?view=calendar&month=${monthParam(year, month)}${extraQuery}`);

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900 dark:text-white">
          {new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <div className="flex items-center gap-2">
          <Link
            href={`/activities?view=calendar&month=${monthParam(prev.year, prev.month)}${extraQuery}`}
            className="btn-secondary btn-sm"
          >
            Previous
          </Link>
          <Link href={`/activities?view=calendar${extraQuery}`} className="btn-secondary btn-sm">
            Today
          </Link>
          <Link
            href={`/activities?view=calendar&month=${monthParam(next.year, next.month)}${extraQuery}`}
            className="btn-secondary btn-sm"
          >
            Next
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-ink-400/15 bg-ink-400/15 dark:border-white/10 dark:bg-white/10">
        {WEEKDAY_LABELS.map((label, i) => {
          const isWeekend = i === 0 || i === 6;
          return (
            <div
              key={label}
              className={`px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide ${
                isWeekend
                  ? "bg-surface text-ink-400 dark:bg-white/[0.02] dark:text-white/25"
                  : "bg-surface text-ink-500 dark:bg-white/[0.03] dark:text-white/40"
              }`}
            >
              {label}
            </div>
          );
        })}

        {weeks.flat().map((day) => {
          const inMonth = day.getMonth() === month;
          const key = dateKey(day);
          const dayActivities = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;

          return (
            <div
              key={key}
              className={`relative min-h-24 space-y-1 p-1.5 ${
                isToday
                  ? "bg-primary-50 ring-1 ring-inset ring-primary/30 dark:bg-primary/10"
                  : isWeekend
                    ? "bg-surface/70 dark:bg-white/[0.015]"
                    : "bg-white dark:bg-ink-800"
              } ${inMonth ? "" : "opacity-40"}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                    isToday ? "bg-primary font-semibold text-white" : "text-ink-500 dark:text-white/40"
                  }`}
                >
                  {day.getDate()}
                </span>
                {!isWeekend && (
                  <Link
                    href={`/activities/new?date=${dateStr}&returnTo=${returnTo}`}
                    title="New activity on this day"
                    className="rounded p-0.5 text-ink-400/50 hover:bg-primary-100 hover:text-primary-700 dark:text-white/20 dark:hover:bg-primary/20 dark:hover:text-primary-100"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
              <div className="space-y-1">
                {dayActivities.map((activity) => (
                  <Link
                    key={activity.id}
                    href={`/activities/${activity.id}`}
                    title={`${activity.activityName}${activity.assignees.length ? ` — ${activity.assignees.map((a) => a.name).join(", ")}` : ""}`}
                    className={`block truncate rounded-sm border-l-2 pl-1.5 pr-1 py-0.5 text-xs ${pillClassFor(activity.assignees.map((a) => a.id))}`}
                  >
                    {activity.activityName}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
