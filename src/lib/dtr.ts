import { prisma } from "@/lib/prisma";

// The DTR filing register is MWPTD's (Office.tracksDtr). One function behind
// every consumer — the three pages, both API routes and the nav — so an office
// either has the module or does not. Gates routes, not just what is drawn:
// hiding a nav entry is convenience, the boundary is the 404 in the handler.
export async function officeTracksDtr(officeId: string): Promise<boolean> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { tracksDtr: true },
  });
  return office?.tracksDtr ?? false;
}

// A DTR covers a month, not a day. Every period is stored as the 1st at UTC
// midnight so that one month is one value: built with Date.UTC rather than
// new Date(y, m, 1), which would be local midnight and land on the previous
// month once serialised from UTC+8. Getting this wrong would file a July DTR
// under June on half the machines that touch it.
export function monthStart(year: number, monthIndex0: number): Date {
  return new Date(Date.UTC(year, monthIndex0, 1));
}

/** "2026-07" → the period Date. Returns null for anything else. */
export function parseMonthParam(value: string | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return monthStart(year, month - 1);
}

/** The period Date → "2026-07", for URLs and <input type="month">. */
export function formatMonthParam(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "July 2026", for headings. Read in UTC to match how the period is stored. */
export function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The current month as a period Date. */
export function currentMonth(): Date {
  const now = new Date();
  return monthStart(now.getUTCFullYear(), now.getUTCMonth());
}

/**
 * The month a DTR is normally filed for: the one just gone. The office receives
 * July's DTRs in early August, so landing on the current month would show an
 * empty roster for most of every month and invite someone to file the wrong one.
 */
export function defaultPeriodMonth(): Date {
  const now = new Date();
  return monthStart(now.getUTCFullYear(), now.getUTCMonth() - 1);
}
