import { prisma } from "@/lib/prisma";

export type DipcrSemesterValue = "FIRST" | "SECOND";

// The D/IPCR is MWPTD's (Office.tracksDipcr). One function behind every
// consumer — the pages, both API routes and the nav — so an office either has
// the module or does not. Gates routes, not just what is drawn.
export async function officeTracksDipcr(officeId: string): Promise<boolean> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { tracksDipcr: true },
  });
  return office?.tracksDipcr ?? false;
}

export function isSemester(value: string): value is DipcrSemesterValue {
  return value === "FIRST" || value === "SECOND";
}

/** The six calendar months a semester covers, in sheet order. */
export function semesterMonths(semester: DipcrSemesterValue): number[] {
  return semester === "FIRST" ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12];
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** 1–12 → "July". */
export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

/** 1–12 → "JUL", as the sheet's column headings run. */
export function monthAbbrev(month: number): string {
  return (MONTH_NAMES[month - 1] ?? String(month)).slice(0, 3).toUpperCase();
}

export function semesterLabel(semester: DipcrSemesterValue): string {
  return semester === "FIRST" ? "1st semester" : "2nd semester";
}

/**
 * The semester being worked on now. A D/IPCR is filled in as the months pass,
 * so the current half of the year is the one to land on — unlike the DTR, which
 * is always filed a month in arrears.
 */
export function currentSemester(): { year: number; semester: DipcrSemesterValue } {
  const now = new Date();
  return {
    year: now.getFullYear(),
    semester: now.getMonth() < 6 ? "FIRST" : "SECOND",
  };
}

/**
 * Money as the sheet writes it: thousands separated, two decimals, no currency
 * symbol — the column is headed "Allotted Budget" and every figure is pesos.
 * Takes the Decimal's string form, because a Prisma Decimal cannot cross into a
 * client component and rounding it through a float would be wrong for money.
 */
export function formatBudget(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
