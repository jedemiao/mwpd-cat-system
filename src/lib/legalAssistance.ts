import { prisma } from "@/lib/prisma";
import type { ClientSex, LegalAssistanceForm } from "@prisma/client";

// The Legal Assistance register is MWPTD's (Office.tracksLegalAssistance). One
// function behind every consumer — both pages, both API routes and the nav — so
// an office either has the module or does not. Gates routes, not only what is
// drawn: hiding a nav entry is convenience, the 404 here is the boundary.
export async function officeTracksLegalAssistance(officeId: string): Promise<boolean> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { tracksLegalAssistance: true },
  });
  return office?.tracksLegalAssistance ?? false;
}

// Sheet order, columns E through L. Not alphabetical — this is the order the
// tick-boxes run in, and anyone copying a row across reads them left to right.
export const ASSISTANCE_FORMS: LegalAssistanceForm[] = [
  "RV",
  "MONEY_CLAIMS",
  "DAW",
  "DAE",
  "IR",
  "TIP",
  "NON_SUPPORT",
  "OTHERS",
];

// The column headings verbatim. The office's own abbreviations are left as
// abbreviations: RV, DAW, DAE, IR and TIP are what the register says and what
// the staff call them, and expanding them here would be a guess printed as
// fact.
export const FORM_LABELS: Record<LegalAssistanceForm, string> = {
  RV: "RV",
  MONEY_CLAIMS: "Money claims",
  DAW: "DAW",
  DAE: "DAE",
  IR: "IR",
  TIP: "TIP",
  NON_SUPPORT: "Non support",
  OTHERS: "Others",
};

export function isAssistanceForm(value: string): value is LegalAssistanceForm {
  return (ASSISTANCE_FORMS as string[]).includes(value);
}

export const SEX_LABELS: Record<ClientSex, string> = {
  MALE: "M",
  FEMALE: "F",
};

export function isClientSex(value: string): value is ClientSex {
  return value === "MALE" || value === "FEMALE";
}

/**
 * The half-open range covering one calendar month, for the register's month
 * view. Half-open rather than a BETWEEN on the last day: a row saved with any
 * time component on the 31st still belongs to that month, which an inclusive
 * end-of-day bound gets wrong by however many hours.
 */
export function monthRange(year: number, month: number): { gte: Date; lt: Date } {
  return {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1)),
  };
}

/** "August 2026", as the sheet's own header above the register reads. */
export function monthHeading(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
