import { DocComplexity } from "@prisma/client";

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
