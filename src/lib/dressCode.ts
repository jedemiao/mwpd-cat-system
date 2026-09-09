// The office dress code, as the app wears it.
//
// DMW Caraga's weekly dress code gives the sidebar its colour. Two of the five
// days are not colours at all, so each is interpreted rather than transcribed:
//
//   Monday    Filipiniana  — an attire, not a hue. Read as the piña/jusi cloth
//                            itself: a cream ground with the weave drawn into
//                            the fill (see .dress-surface in globals.css).
//                            This is the one day the sidebar runs dark-on-light.
//   Tuesday   Blue         — pitched deliberately dark. A bright blue would sit
//                            on top of the `info` token (#3d99f5) that inline
//                            hints and links already use.
//   Wednesday Violet       — near the app's own indigo, so midweek barely moves.
//   Thursday  Brown        — the tight one. See the warning below.
//   Friday    Any colour   — a permission, not a hue. Falls back to the app's
//                            indigo for now; the intended reading is a per-user
//                            pick, which is additive to this table.
//
// Weekends and holidays fall back to the indigo too — there is no uniform to
// reflect, so the app wears its own colour.
//
// WHY THESE ARE RGB TRIPLETS, NOT HEX
// Tailwind composes them with <alpha-value> (see tailwind.config.ts), which is
// what makes `bg-dayfg/15` and `text-dayfg/70` work at all. A hex value here
// silently breaks every opacity modifier in Sidebar.tsx.
//
// WHAT MUST NOT BE THEMED
// The ARTA tokens — danger, warning, success, stamp, duesoon — are frozen on
// every day of the week. Colour already carries meaning in this app (red is
// overdue, amber is due-soon, green is completed), and activityCategories.ts
// makes the same point about category chips: a chip "must never be readable as
// a status badge". A daily theme that repainted those would break that on its
// own schedule. The day colour is confined to the sidebar surface.
//
// CAUTION — Thursday sits close to `duesoon` (#96700c).
// Both are warm browns; they separate at only 1.58:1. It holds because the day
// colour never touches the chip — it lives in the sidebar, across a card edge
// from the docket board, and the chip carries its own border and uppercase
// label. If it ever reads muddy, darken THIS value rather than the token.

export type DressDay = "mon" | "tue" | "wed" | "thu" | "fri" | "off";

// The office keeps Philippine time; the container may not. Asking the server
// for its own weekday would roll the colour over at the wrong hour whenever the
// host runs UTC — 8am in Butuan is still the previous day there.
export const OFFICE_TZ = "Asia/Manila";

const WEEKDAY_TO_DRESS: Record<string, DressDay> = {
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "off",
  Sun: "off",
};

/** The dress-code day in the office's own timezone, not the server's. */
export function dressDayFor(date: Date = new Date()): DressDay {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: OFFICE_TZ,
    weekday: "short",
  }).format(date);

  return WEEKDAY_TO_DRESS[weekday] ?? "off";
}

// Labels for anywhere the choice needs explaining to a person (a tooltip, a
// settings screen). Not used by the theming itself, which reads only the key.
export const DRESS_DAY_LABELS: Record<DressDay, string> = {
  mon: "Filipiniana",
  tue: "Blue",
  wed: "Violet",
  thu: "Brown",
  fri: "Any colour",
  off: "No dress code",
};
