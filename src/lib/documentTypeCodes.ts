// Document type codes for auto-generated routing numbers, per the office's
// abbreviation legend. Shared by Incoming (MMDDYY-TYPE-###) and Outgoing
// (MMDDYY-<office prefix>-TYPE-###).
export const DOCUMENT_TYPE_CODES = [
  { code: "A", label: "Advisory" },
  { code: "AO", label: "Administrative Order" },
  { code: "C", label: "Certification" },
  { code: "E", label: "Email / Endorsement" },
  { code: "DC", label: "Deployment Certificate" },
  { code: "HRR", label: "HR Request" },
  { code: "IA", label: "Inspection Authority" },
  { code: "JM", label: "Joint Memorandum" },
  { code: "L", label: "Letter" },
  { code: "NR", label: "Narrative Report" },
  { code: "PAFR", label: "Post-Activity Feedback Report" },
  { code: "MOA", label: "Memo of Agreement" },
  { code: "PR", label: "Press Release" },
  { code: "R", label: "Request" },
  { code: "RL", label: "Resignation Letter" },
  { code: "TEV", label: "Travel Expense Voucher" },
  { code: "M", label: "Memorandum" },
  { code: "MA", label: "Mail" },
  // Both observed in the source tracker's live ledgers (e.g. 073026-MO-005,
  // MOM-06-2026) but missing from the original legend.
  { code: "MO", label: "Memorandum Order" },
  { code: "MOM", label: "Minutes of Meeting" },
] as const;

export type DocumentTypeCode = (typeof DOCUMENT_TYPE_CODES)[number]["code"];

export const DOCUMENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  DOCUMENT_TYPE_CODES.map((t) => [t.code, t.label]),
);

export const DOCUMENT_TYPE_CODE_VALUES = DOCUMENT_TYPE_CODES.map((t) => t.code) as [DocumentTypeCode, ...DocumentTypeCode[]];

// MMDDYY, matching the office's existing routing number convention.
export function formatRoutingDate(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const yy = String(date.getUTCFullYear()).slice(-2);
  return `${mm}${dd}${yy}`;
}

// Incoming: MMDDYY-TYPE-###
export function buildRoutingNumber(date: Date, type: DocumentTypeCode, seq: number): string {
  return `${formatRoutingDate(date)}-${type}-${String(seq).padStart(3, "0")}`;
}

// Outgoing: MMDDYY-<office prefix>-TYPE-### — office prefix is the office's
// short code up to its first hyphen (e.g. "MWPTD-CARAGA" -> "MWPTD"), so a
// second office onboarded later gets its own prefix automatically.
export function buildOutgoingRoutingNumber(date: Date, officePrefix: string, type: DocumentTypeCode, seq: number): string {
  return `${formatRoutingDate(date)}-${officePrefix}-${type}-${String(seq).padStart(3, "0")}`;
}
