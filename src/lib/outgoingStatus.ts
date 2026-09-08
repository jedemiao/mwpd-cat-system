import type { OutgoingStatus } from "@prisma/client";

// One place both the work board and the reply screen read these from, so a
// document never describes itself one way in the list and another way when
// opened.
export const OUTGOING_STATUS_LABELS: Record<OutgoingStatus, string> = {
  DRAFT: "Draft",
  FOR_CHECKING: "For checking",
  RETURNED: "Returned",
  APPROVED: "Approved",
  RELEASED: "Released",
};

// Whose move it is. The status alone says what state the document is in; this
// says who is holding it up, which is the question somebody scanning the board
// is actually asking.
export const OUTGOING_STATUS_HINTS: Record<OutgoingStatus, string> = {
  DRAFT: "With the assigned staff",
  FOR_CHECKING: "With the Division Chief",
  RETURNED: "Back with staff for revision",
  APPROVED: "Cleared — awaiting release",
  RELEASED: "Out of the office",
};

export type BadgeVariant = "success" | "danger" | "warning" | "secondary" | "info";

// RETURNED is the only warning colour on the board. It is the one state that
// means something went wrong and somebody has to redo work; DRAFT and
// FOR_CHECKING are just the process running normally, and colouring them as
// alerts would make a busy, healthy board look like a list of problems.
export const OUTGOING_STATUS_VARIANT: Record<OutgoingStatus, BadgeVariant> = {
  DRAFT: "secondary",
  FOR_CHECKING: "info",
  RETURNED: "warning",
  APPROVED: "success",
  RELEASED: "success",
};

// The board's own order — the sequence a document actually moves through, so
// rows group by how far along they are rather than alphabetically by a label
// nobody chose for sorting.
export const WORK_BOARD_ORDER: OutgoingStatus[] = ["RETURNED", "DRAFT", "FOR_CHECKING", "APPROVED"];
