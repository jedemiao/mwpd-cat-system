// Activity categories — the office's own vocabulary for what a day is, taken
// from the source tracker's "Legend" dropdown.
//
// No Prisma import here on purpose: this module is used by the client
// components (ActivityForm, ActivityCalendar) as well as the server pages, and
// importing @prisma/client into a client bundle pulls the query engine in with
// it. The values are plain string literals that happen to match the
// ActivityCategory enum, which is exactly how documentTypeCodes.ts works.

export const ACTIVITY_CATEGORIES = [
  "INSPECTION",
  "QUICK_RESPONSE_TEAM",
  "CONFERENCE_TRAINING",
  "MEETINGS",
  "SKELETON_FORCE",
  "PUBLIC_HOLIDAY",
  "OTHERS",
] as const;

export type ActivityCategoryValue = (typeof ACTIVITY_CATEGORIES)[number];

export function isActivityCategory(value: string): value is ActivityCategoryValue {
  return (ACTIVITY_CATEGORIES as readonly string[]).includes(value);
}

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategoryValue, string> = {
  INSPECTION: "Inspection",
  QUICK_RESPONSE_TEAM: "Quick-Response Team",
  CONFERENCE_TRAINING: "Conference / Training",
  MEETINGS: "Meetings",
  SKELETON_FORCE: "Skeleton Force",
  PUBLIC_HOLIDAY: "Public Holiday",
  OTHERS: "Others",
};

// `categoryOther` carries the free-text specification, and only when the
// category is OTHERS — same contract as leaveTypeLabel() in leaveTypes.ts. The
// routes clear the column whenever the category isn't OTHERS, so the guard here
// is belt-and-braces for rows written before that rule existed.
export function activityCategoryLabel(category: ActivityCategoryValue, categoryOther?: string | null): string {
  const label = ACTIVITY_CATEGORY_LABELS[category] ?? category;
  return category === "OTHERS" && categoryOther ? `${label} — ${categoryOther}` : label;
}

// Spelled out where there is room for it (the entry form's dropdown); the
// short label above is what fits on a calendar chip and in the legend.
export const ACTIVITY_CATEGORY_DESCRIPTIONS: Partial<Record<ActivityCategoryValue, string>> = {
  QUICK_RESPONSE_TEAM: "QRT deployment",
  SKELETON_FORCE: "Reduced office coverage",
};

// Why these hues.
//
// Every colour here comes from Tailwind's stock palette, and none of them are
// the app's own semantic tokens (primary / success / warning / danger / info).
// That separation is the point: those tokens carry ARTA meaning elsewhere in
// the app — red is overdue, amber is due-soon, green is completed — and a
// category chip must never be readable as a status badge. Drawing categories
// from a different palette namespace makes that structural rather than a
// matter of remembering.
//
// Within the palette, saturation encodes what kind of day it is. Work the
// office goes out and does is saturated (fuchsia / orange / cyan / teal);
// days that are really a statement about office coverage rather than an
// activity are muted greys (slate / stone / zinc). So the calendar separates
// "we are doing things" from "we are thin on the ground" before anyone reads a
// single label.
//
// Class strings are written out in full because Tailwind scans source text —
// a composed `bg-${hue}-50` would be purged from the stylesheet.
export const ACTIVITY_CATEGORY_CHIP: Record<ActivityCategoryValue, string> = {
  INSPECTION:
    "border-l-fuchsia-500 bg-fuchsia-50 text-fuchsia-800 hover:bg-fuchsia-100 dark:bg-fuchsia-400/15 dark:text-fuchsia-200 dark:hover:bg-fuchsia-400/25",
  QUICK_RESPONSE_TEAM:
    "border-l-orange-500 bg-orange-50 text-orange-800 hover:bg-orange-100 dark:bg-orange-400/15 dark:text-orange-200 dark:hover:bg-orange-400/25",
  CONFERENCE_TRAINING:
    "border-l-cyan-500 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 dark:bg-cyan-400/15 dark:text-cyan-200 dark:hover:bg-cyan-400/25",
  MEETINGS:
    "border-l-teal-500 bg-teal-50 text-teal-800 hover:bg-teal-100 dark:bg-teal-400/15 dark:text-teal-200 dark:hover:bg-teal-400/25",
  SKELETON_FORCE:
    "border-l-slate-500 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-400/15 dark:text-slate-200 dark:hover:bg-slate-400/25",
  PUBLIC_HOLIDAY:
    "border-l-stone-500 bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-400/15 dark:text-stone-200 dark:hover:bg-stone-400/25",
  OTHERS:
    "border-l-zinc-400 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-400/15 dark:text-zinc-200 dark:hover:bg-zinc-400/25",
};

export const ACTIVITY_CATEGORY_DOT: Record<ActivityCategoryValue, string> = {
  INSPECTION: "bg-fuchsia-500",
  QUICK_RESPONSE_TEAM: "bg-orange-500",
  CONFERENCE_TRAINING: "bg-cyan-500",
  MEETINGS: "bg-teal-500",
  SKELETON_FORCE: "bg-slate-500",
  PUBLIC_HOLIDAY: "bg-stone-500",
  OTHERS: "bg-zinc-400",
};

// "On Leave" is the source tracker's ninth legend entry and it is deliberately
// not an ActivityCategory — see the enum comment in schema.prisma. Leave is
// read out of the Leave table and drawn onto the calendar, so it needs a chip
// style and a legend entry without ever being a value anything can store.
//
// Rose is the one warm red-ish hue on the calendar, which makes an absence the
// thing that stands out on a month grid — the question the calendar gets asked
// most often is who is out. It is the closest of these eight to an app semantic
// token (danger), but ARTA badges never render on this page, and a leave chip
// is further distinguished by carrying a person's name rather than an activity.
export const LEAVE_LEGEND_LABEL = "On Leave";
export const LEAVE_CHIP =
  "border-l-rose-500 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:bg-rose-400/15 dark:text-rose-200 dark:hover:bg-rose-400/25";
export const LEAVE_DOT = "bg-rose-500";
