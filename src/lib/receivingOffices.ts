// The offices a released document can be routed to.
//
// This was a free-text box ("PROTECTION, FAD, ORD…") on every division's
// Outgoing form, which meant the same office arrived in the ledger spelled a
// dozen ways — PROTECTION, MWPTD, Protection Div., PROT. A fixed list of
// checkboxes ends that, and makes the Office column groupable rather than just
// readable.
//
// The list is the same for every division, by instruction. It is the roster of
// destinations, not the roster of tenant divisions in the Office table, so the
// two are not expected to match — ADJU (Adjudication) takes documents but is
// not a tenant here.
//
// Ordered as the office reads it rather than alphabetically: the two directors'
// offices first, then Adjudication, then the four divisions. A division
// dispatching to itself is not filtered out — a document routed internally is
// something the register does record.
export const RECEIVING_OFFICES = ["ORD", "ARD", "ADJU", "MWPTD", "MWPSD", "WRSD", "FAD"] as const;

export type ReceivingOffice = (typeof RECEIVING_OFFICES)[number];

// Stored in the existing OutgoingDocument.receivingOffice string column, comma
// separated, rather than in a new array column. A document can go to more than
// one office, and comma-separated is how the offices already wrote it by hand,
// so existing rows read back correctly with no migration.
const SEPARATOR = ", ";

/**
 * Splits a stored value into the codes this list knows and anything else.
 *
 * `extras` exists so that converting the field from free text cannot silently
 * discard what an office typed before the list existed. Whatever it holds is
 * shown beside the checkboxes and written back on save.
 */
export function parseReceivingOffices(value: string | null | undefined): {
  selected: ReceivingOffice[];
  extras: string[];
} {
  const tokens = (value ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const selected: ReceivingOffice[] = [];
  const extras: string[] = [];

  for (const token of tokens) {
    const match = RECEIVING_OFFICES.find((o) => o.toLowerCase() === token.toLowerCase());
    if (match) {
      if (!selected.includes(match)) selected.push(match);
    } else {
      extras.push(token);
    }
  }

  return { selected, extras };
}

/**
 * Joins a selection back into the stored string. Ticked offices are written in
 * the list's own order rather than click order, so two records routed to the
 * same offices read identically in the ledger.
 */
export function formatReceivingOffices(selected: readonly string[], extras: readonly string[] = []): string {
  const ordered = RECEIVING_OFFICES.filter((o) => selected.includes(o));
  return [...ordered, ...extras].join(SEPARATOR);
}

// What each code is called on screen. The codes themselves are the STORED
// value — they sit in OutgoingDocument.receivingOffice and are matched against
// Office.code to decide who a released document is delivered to — so renaming
// an office is a label change here, never a change to the list above. Renaming
// the values would orphan every document already filed against the old string
// and silently stop deliveries resolving.
//
// The two divisions the office refers to by function rather than acronym are
// spelled that way; the rest are known by their initials and left alone.
export const RECEIVING_OFFICE_LABELS: Record<ReceivingOffice, string> = {
  ORD: "ORD",
  ARD: "ARD",
  ADJU: "ADJU",
  MWPTD: "Protection",
  MWPSD: "Processing",
  WRSD: "WRSD",
  FAD: "FAD",
};

/** A stored code as it should read on screen; unknown values pass through. */
export function receivingOfficeLabel(code: string): string {
  return RECEIVING_OFFICE_LABELS[code as ReceivingOffice] ?? code;
}

/** A stored "MWPTD, ADJU" string rendered as "Protection, ADJU". */
export function formatReceivingOfficeLabels(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .split(",")
    .map((t) => receivingOfficeLabel(t.trim()))
    .filter(Boolean)
    .join(", ");
}
