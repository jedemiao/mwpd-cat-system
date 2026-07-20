// Formats a Date (or null/undefined) as the yyyy-mm-dd string an
// <input type="date"> expects.
export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}
