// Structurally the same as Prisma's DocComplexity enum, declared locally so
// this module carries no @prisma/client import. The incoming form is a client
// component and needs computeDueDate to fill the due date as the Division Chief
// picks a lead time; importing the Prisma client into the browser bundle to get
// a three-value union would be a steep price for a type. Prisma's own enum
// values assign to this union, so server callers are unaffected.
export type DocComplexity = "SIMPLE" | "COMPLEX" | "HIGHLY_TECHNICAL";

// Anti-Red Tape Act (ARTA) standard lead times, in working days.
export const ARTA_LEAD_DAYS: Record<DocComplexity, number> = {
  SIMPLE: 3,
  COMPLEX: 7,
  HIGHLY_TECHNICAL: 20,
};

// Adds N working days to a date, skipping Saturdays and Sundays.
export function addWorkingDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

export function computeDueDate(dateReceived: Date, complexity: DocComplexity): Date {
  return addWorkingDays(dateReceived, ARTA_LEAD_DAYS[complexity]);
}
