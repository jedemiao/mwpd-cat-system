import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// The authenticated caller, with role and officeId read from the database
// rather than taken from the JWT.
//
// Why this exists: the session token is a snapshot from sign-in time. NextAuth
// keeps issuing it until it expires (30 days by default), so a JWT can outlive
// the facts it asserts. Two ways that bites, both observed before this helper
// was added:
//
//   - a DEACTIVATED account kept writing through /api/* — the dashboard layout
//     re-checks isActive, but API routes never go through a layout;
//   - a user demoted from DIVISION_CHIEF to STAFF still passed
//     canManageUsers() and successfully created an account, because the token
//     still said DIVISION_CHIEF.
//
// Returning null for a deactivated user means every route's existing
// `if (!session) return 401` now also ends access the moment someone is
// deactivated, with no other change to the route.
//
// Costs one indexed primary-key lookup per authenticated request, which is the
// right trade for an on-premise office app: role and status changes take effect
// immediately instead of whenever a token happens to expire.
export async function getActiveSession(): Promise<Session | null> {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const fresh = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { officeId: true, role: true, isActive: true },
  });
  if (!fresh || !fresh.isActive) return null;

  return { ...session, user: { ...session.user, officeId: fresh.officeId, role: fresh.role } };
}
