// Display labels for LeaveType. Shared because leave is now read in two
// places: its own ledger, and the activity calendar, which projects leave
// records as read-only chips. Two copies of this map would drift.

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  CTO: "CTO",
  VACATION: "Vacation",
  SICK: "Sick",
  EMERGENCY: "Emergency",
  OTHER: "Other",
};

// `typeOther` carries the free-text specification when type is OTHER.
export function leaveTypeLabel(type: string, typeOther: string | null): string {
  const label = LEAVE_TYPE_LABELS[type] ?? type;
  return type === "OTHER" && typeOther ? `${label} — ${typeOther}` : label;
}
