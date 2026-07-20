import { Role } from "@prisma/client";

// Division Chief sign-off is a distinct accountability step (see
// IncomingDocument.dcSignOffDate) — only the Chief, or an Admin standing in,
// can attest to it.
export function canSignOffAsChief(role: Role): boolean {
  return role === "DIVISION_CHIEF" || role === "ADMIN";
}

// Deleting a compliance record (not just editing it) is reserved for roles
// with oversight authority, so a mistaken or malicious delete can't happen
// from a routine data-entry account.
export function canDelete(role: Role): boolean {
  return role === "DIVISION_CHIEF" || role === "ADMIN";
}
