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
  // Escape hatch for a type the legend does not name. Deliberately last in the
  // list, and unlike Activity's OTHERS it is never a default — picking it is a
  // choice, so the accompanying free text (documentTypeOther) is required, the
  // same rule Leave.typeOther follows.
  { code: "O", label: "Others" },
] as const;

/** The code whose selection requires a free-text specification. */
export const DOCUMENT_TYPE_OTHER_CODE = "O";

/** Label for display: the typed specification when "Others", else the legend label. */
export function documentTypeLabel(code: string | null, other: string | null): string {
  if (!code) return "—";
  if (code === DOCUMENT_TYPE_OTHER_CODE && other) return other;
  return DOCUMENT_TYPE_LABELS[code] ?? code;
}

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

// Incoming (EXTERNAL): MMDDYY-TYPE-###
export function buildRoutingNumber(date: Date, type: DocumentTypeCode, seq: number): string {
  return `${formatRoutingDate(date)}-${type}-${String(seq).padStart(3, "0")}`;
}

// Incoming (INTERNAL): TYPE-NN-YYYY — e.g. "MOM-06-2026". Deliberately a
// different shape from the external format above, copied from the office's own
// internal ledger.
//
// The difference is load-bearing, not cosmetic. Internal and external documents
// draw on separate counters (Office.incomingInternalSeqCounter vs
// incomingSeqCounter), so both runs pass through 001 — and routingNumber is
// unique across the whole table. These two formats can never produce the same
// string because an external number always begins with six digits and an
// internal one always begins with a letter. Keep that property if either format
// is ever changed.
export function buildInternalRoutingNumber(date: Date, type: DocumentTypeCode, seq: number): string {
  return `${type}-${String(seq).padStart(2, "0")}-${date.getUTCFullYear()}`;
}

// Outgoing: MMDDYY-<office prefix>-TYPE-### — office prefix is the office's
// short code up to its first hyphen (e.g. "MWPTD-CARAGA" -> "MWPTD"), so a
// second office onboarded later gets its own prefix automatically.
export function buildOutgoingRoutingNumber(date: Date, officePrefix: string, type: DocumentTypeCode, seq: number): string {
  return `${formatRoutingDate(date)}-${officePrefix}-${type}-${String(seq).padStart(3, "0")}`;
}
