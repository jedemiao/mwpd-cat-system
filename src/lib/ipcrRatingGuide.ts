import { prisma } from "@/lib/prisma";
import type { IpcrRatingDimension } from "@prisma/client";

// The IPCR Rating Guide is MWPTD's (Office.tracksIpcrRatingGuide). One function
// behind every consumer — both pages, both API routes and the nav — so an
// office either has the module or does not. Gates routes, not only what is
// drawn: hiding a nav entry is convenience, the 404 here is the boundary.
//
// Separate from officeTracksDipcr on purpose. The two sheets travel together in
// MWPTD's workbook, but they are different documents with different lifecycles,
// and a division can keep a D/IPCR without ever agreeing a written rating scale
// for it.
export async function officeTracksIpcrRatingGuide(officeId: string): Promise<boolean> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { tracksIpcrRatingGuide: true },
  });
  return office?.tracksIpcrRatingGuide ?? false;
}

// Sheet order, not alphabetical: an indicator is read down its dimensions in
// this sequence, and Timeliness is last because it is the one many rows leave
// out.
export const RATING_DIMENSIONS: IpcrRatingDimension[] = ["QUALITY", "EFFICIENCY", "TIMELINESS"];

export const DIMENSION_LABELS: Record<IpcrRatingDimension, string> = {
  QUALITY: "Quality",
  EFFICIENCY: "Efficiency",
  TIMELINESS: "Timeliness",
};

export function isDimension(value: string): value is IpcrRatingDimension {
  return (RATING_DIMENSIONS as string[]).includes(value);
}

// The five columns, highest first — the direction the sheet reads, and the
// direction anybody rating against it thinks in ("is this a 5 or a 4?").
export const RATING_LEVELS = [5, 4, 3, 2, 1] as const;
export type RatingLevel = (typeof RATING_LEVELS)[number];

// The scale's official wording. Kept here rather than typed into the page so
// the column headings, the form's field labels and the print view cannot
// describe the same score three different ways.
export const LEVEL_LABELS: Record<RatingLevel, string> = {
  5: "Outstanding",
  4: "Very Satisfactory",
  3: "Satisfactory",
  2: "Unsatisfactory",
  1: "Poor",
};

/** "5 – Outstanding", as the sheet's own headings run. */
export function levelHeading(level: RatingLevel): string {
  return `${level} – ${LEVEL_LABELS[level]}`;
}

// The descriptor columns are level5..level1 on the row. This maps a level to
// its field so the page and the form can loop over RATING_LEVELS instead of
// writing all five out twice.
export type DescriptorFields = {
  level5: string | null;
  level4: string | null;
  level3: string | null;
  level2: string | null;
  level1: string | null;
};

export function descriptorFor(fields: DescriptorFields, level: RatingLevel): string | null {
  return fields[`level${level}` as keyof DescriptorFields];
}

// One dimension's five descriptors as they arrive from the form.
export type DescriptorInput = {
  dimension: IpcrRatingDimension;
  level5?: string | null;
  level4?: string | null;
  level3?: string | null;
  level2?: string | null;
  level1?: string | null;
};

/**
 * Normalises submitted descriptors and drops the dimensions nothing was written
 * against. "" becomes null so an emptied box and an untouched box are stored as
 * the same thing, and a dimension left entirely blank produces no row at all —
 * that is the office choosing not to rate on it, which is a different fact from
 * rating on it with empty wording. Shared by POST and PATCH so create and
 * update cannot disagree about what "blank" means.
 */
export function usedDescriptors(descriptors: DescriptorInput[]) {
  return descriptors
    .map((d) => ({
      dimension: d.dimension,
      level5: d.level5?.trim() || null,
      level4: d.level4?.trim() || null,
      level3: d.level3?.trim() || null,
      level2: d.level2?.trim() || null,
      level1: d.level1?.trim() || null,
    }))
    .filter((d) => d.level5 || d.level4 || d.level3 || d.level2 || d.level1);
}
