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
