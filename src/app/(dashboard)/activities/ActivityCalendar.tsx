import Link from "next/link";
import { PlusIcon } from "@/components/icons";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_CHIP,
  ACTIVITY_CATEGORY_DOT,
  ACTIVITY_CATEGORY_LABELS,
  activityCategoryLabel,
  LEAVE_CHIP,
  LEAVE_DOT,
  LEAVE_LEGEND_LABEL,
  type ActivityCategoryValue,
} from "@/lib/activityCategories";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type CalendarActivity = {
  id: string;
  date: Date;
  endDate: Date | null;
  activityName: string;
  category: ActivityCategoryValue;
  categoryOther: string | null;
  location: string | null;
  assignees: { id: string; name: string }[];
};

// Projected from the Leave table, never from Activity. These are read-only on
// the calendar: the Leave module is the only place one can be filed or edited,
// so a chip here links to the record rather than offering to create anything.
type CalendarLeave = {
  id: string;
  personName: string;
  typeLabel: string;
  date: Date;
  endDate: Date | null;
};

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Walks [start, end] a day at a time and drops the entry into every bucket it
// spans, so a multi-day activity or leave gets a chip on each of its days
// rather than only the first.
function bucketByDay<T extends { date: Date; endDate: Date | null }>(entries: T[]) {
  const byDay = new Map<string, T[]>();
  for (const entry of entries) {
    const last = entry.endDate ?? entry.date;
    for (
      let d = new Date(entry.date.getFullYear(), entry.date.getMonth(), entry.date.getDate());
      d <= last;
      d.setDate(d.getDate() + 1)
    ) {
      const key = dateKey(d);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(entry);
    }
  }
  return byDay;
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

function dateRangeLabel(start: Date, end: Date | null) {
  return end ? ` (${start.toLocaleDateString()} – ${end.toLocaleDateString()})` : "";
}

export function ActivityCalendar({
  year,
  month,
  activities,
  leaves,
  extraQuery,
}: {
  year: number;
  month: number; // 0-indexed
  activities: CalendarActivity[];
  leaves: CalendarLeave[]; // empty when a category filter is narrowing the grid
  extraQuery: string; // query string fragment to preserve (e.g. "&q=inspection"), "" if none
}) {
  const weeks = buildWeeks(year, month);
  const today = new Date();
  const todayKey = dateKey(today);

  const activitiesByDay = bucketByDay(activities);
  const leavesByDay = bucketByDay(leaves);

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
        <div className="flex items-center gap-2 print:hidden">
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

      {/* The legend is the key to the category vocabulary, so it lists all nine
          entries regardless of what this particular month happens to contain.
          Hidden in print: the printed grid loses chip colour entirely (see the
          globals.css print block), and prints the category as text on each chip
          instead, which makes a colour key on paper actively misleading. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 print:hidden">
        {ACTIVITY_CATEGORIES.map((category) => (
          <span key={category} className="inline-flex items-center gap-1.5 text-xs text-ink-600 dark:text-white/60">
            <span className={`h-2.5 w-2.5 rounded-sm ${ACTIVITY_CATEGORY_DOT[category]}`} />
            {ACTIVITY_CATEGORY_LABELS[category]}
          </span>
        ))}
        <span
          title="Filed in the Leave module and shown here — leave can't be created from the calendar"
          className="inline-flex items-center gap-1.5 text-xs text-ink-600 dark:text-white/60"
        >
          <span className={`h-2.5 w-2.5 rounded-sm ${LEAVE_DOT}`} />
          {LEAVE_LEGEND_LABEL}
        </span>
      </div>

      {/* calendar-grid is the hook for the print rules in globals.css. Colour
          can't be handled with Tailwind `print:` utilities here: `dark:`
          variants compile to a descendant selector (.dark .foo) and so outrank
          a plain `print:` class, which would print the dark theme verbatim. */}
      <div className="calendar-grid grid grid-cols-7 gap-px overflow-hidden rounded-md border border-ink-400/15 bg-ink-400/15 dark:border-white/10 dark:bg-white/10">
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
          const dayActivities = activitiesByDay.get(key) ?? [];
          const dayLeaves = leavesByDay.get(key) ?? [];
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
                    className="rounded p-0.5 text-ink-400/50 hover:bg-primary-100 hover:text-primary-700 dark:text-white/20 dark:hover:bg-primary/20 dark:hover:text-primary-100 print:hidden"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
              <div className="space-y-1">
                {dayActivities.map((activity) => {
                  const categoryLabel = activityCategoryLabel(activity.category, activity.categoryOther);
                  const where = activity.location ? ` @ ${activity.location}` : "";
                  const who = activity.assignees.length ? ` — ${activity.assignees.map((a) => a.name).join(", ")}` : "";
                  return (
                    <Link
                      key={activity.id}
                      href={`/activities/${activity.id}`}
                      title={`${categoryLabel}: ${activity.activityName}${where}${dateRangeLabel(activity.date, activity.endDate)}${who}`}
                      className={`calendar-pill block truncate rounded-sm border-l-2 pl-1.5 pr-1 py-0.5 text-xs ${ACTIVITY_CATEGORY_CHIP[activity.category]}`}
                    >
                      {/* On paper the chip has no colour, so the category it
                          encodes on screen has to become words. */}
                      <span className="hidden print:inline">{categoryLabel} — </span>
                      {activity.activityName}
                    </Link>
                  );
                })}

                {dayLeaves.map((leave) => (
                  <Link
                    key={leave.id}
                    href={`/leave/${leave.id}`}
                    title={`${LEAVE_LEGEND_LABEL} (${leave.typeLabel}): ${leave.personName}${dateRangeLabel(leave.date, leave.endDate)}`}
                    className={`calendar-pill block truncate rounded-sm border-l-2 pl-1.5 pr-1 py-0.5 text-xs ${LEAVE_CHIP}`}
                  >
                    {/* Leave chips carry the person's name — the activity name
                        is what identifies an activity, but for an absence the
                        useful fact is who is out. */}
                    <span className="hidden print:inline">{LEAVE_LEGEND_LABEL} — </span>
                    {leave.personName}
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
