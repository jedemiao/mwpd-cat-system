// SENA conference vocabulary — statuses, conference numbering, and the time
// slots the office books conferences into.
//
// No Prisma import here on purpose: this module is used by SenaForm (a client
// component) as well as the server pages, and importing @prisma/client into a
// client bundle pulls the query engine in with it. The status values are plain
// string literals that happen to match the SenaStatus enum — exactly how
// activityCategories.ts works. The office gate lives in src/lib/sena.ts, which
// is server-only.

export const SENA_STATUSES = [
  "SCHEDULED",
  "SETTLED",
  "FOR_SECOND_CONFERENCE",
  "NOT_SETTLED",
  "WITHDRAWN",
] as const;

export type SenaStatusValue = (typeof SENA_STATUSES)[number];

export function isSenaStatus(value: string): value is SenaStatusValue {
  return (SENA_STATUSES as readonly string[]).includes(value);
}

// The sheet writes these as SETTLED / FOR 2ND CON / WITHDRAWN and leaves the
// cell blank for a conference that hasn't happened yet. "Scheduled" is that
// blank given a name.
export const SENA_STATUS_LABELS: Record<SenaStatusValue, string> = {
  SCHEDULED: "Scheduled",
  SETTLED: "Settled",
  FOR_SECOND_CONFERENCE: "For 2nd conference",
  NOT_SETTLED: "Not settled",
  WITHDRAWN: "Withdrawn",
};

// Chip styling for the register and the dashboard.
//
// These deliberately avoid the ARTA semantic tokens (danger / warning / success
// / stamp / duesoon) for the same reason activityCategories.ts does: red means
// overdue everywhere else in this app, and a settled conference is not a
// deadline outcome. Drawn from Tailwind's stock palette instead, and written
// out in full because Tailwind scans source text.
export const SENA_STATUS_CHIP: Record<SenaStatusValue, string> = {
  SCHEDULED:
    "border-slate-400/40 bg-slate-100 text-slate-700 dark:bg-slate-400/15 dark:text-slate-200",
  SETTLED:
    "border-emerald-500/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200",
  FOR_SECOND_CONFERENCE:
    "border-sky-500/40 bg-sky-50 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200",
  NOT_SETTLED:
    "border-rose-500/40 bg-rose-50 text-rose-800 dark:bg-rose-400/15 dark:text-rose-200",
  WITHDRAWN:
    "border-zinc-400/40 bg-zinc-100 text-zinc-600 dark:bg-zinc-400/15 dark:text-zinc-300",
};

/** Only a settled conference carries a peso figure. */
export function statusCarriesAmount(status: SenaStatusValue): boolean {
  return status === "SETTLED";
}

// The slots the office books into. The sheet's dropdown shows 10:00 AM, 11:00
// AM, 1:00 PM, 1:30 PM, 3:00 PM and 4:00 PM; the rest are the neighbouring
// hours of the same working day, so a conference set slightly off the usual
// times doesn't force a free-text field.
//
// Stored 24-hour so the values sort lexically — "09:00" < "13:30" < "16:00" —
// which is what lets a day's conferences come back in the order they happen
// with a plain orderBy and no lookup table.
export const CONFERENCE_TIME_SLOTS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "13:00",
  "13:30",
  "14:00",
  "15:00",
  "16:00",
] as const;

export function isConferenceTime(value: string): boolean {
  return (CONFERENCE_TIME_SLOTS as readonly string[]).includes(value);
}

/** "13:30" → "1:30 PM", the way the register reads it. */
export function formatConferenceTime(value: string): string {
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const suffix = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th". The sheet's Conference column. */
export function conferenceOrdinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
