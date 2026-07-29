import { Role } from "@prisma/client";

// Gates the whole "DC column" of IncomingDocument — routing, complexity,
// instructions, corrections count, completion date, and dcSignOffDate
// itself. ADAS III / records staff own intake (date received, routing
// number, title, scanned copy, filed); everything the Division Chief
// reviews and directs is restricted to the Chief, or an Admin standing in.
export function canSignOffAsChief(role: Role): boolean {
  return role === "DIVISION_CHIEF" || role === "ADMIN";
}

// Deleting a compliance record (not just editing it) is reserved for roles
// with oversight authority, so a mistaken or malicious delete can't happen
// from a routine data-entry account.
export function canDelete(role: Role): boolean {
  return role === "DIVISION_CHIEF" || role === "ADMIN";
}

// Resetting another account's password (for staff who forgot theirs) is an
// oversight action: the Division Chief — or an Admin standing in — can set a
// new password for someone in their office without knowing the old one. The
// route additionally forbids a Chief from resetting an Admin (see
// /api/account/reset-password); this is enforced server-side, not just hidden
// in Settings.
export function canResetStaffPassword(role: Role): boolean {
  return role === "DIVISION_CHIEF" || role === "ADMIN";
}
