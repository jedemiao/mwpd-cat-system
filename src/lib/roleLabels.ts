import { Role } from "@prisma/client";

// Display names for the four roles. The enum values are shouty database
// constants; these are what the office actually calls the posts.
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  DIVISION_CHIEF: "Division Chief",
  RECORDS_STAFF: "Records staff (ADAS III)",
  STAFF: "Staff",
};

// Assignment order, least to most authority — matches how the dropdowns read.
export const ASSIGNABLE_ROLES: Role[] = ["STAFF", "RECORDS_STAFF", "DIVISION_CHIEF", "ADMIN"];
