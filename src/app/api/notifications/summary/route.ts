import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getArtaAlertCounts } from "@/lib/artaAlerts";
import { getRoutedToMeSummary } from "@/lib/notifications";

// Next's static analysis doesn't see the cookies() read that happens inside
// getServerSession (it's in the NextAuth library, not this file), so without
// this the route gets treated as cacheable and serves a stale snapshot to
// every user instead of a fresh one per request.
export const dynamic = "force-dynamic";

// Authoritative snapshot the notification bell re-fetches whenever a live
// event arrives, instead of hand-rolling increment/decrement math client-side.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [arta, routed] = await Promise.all([
    getArtaAlertCounts(session.user.officeId),
    getRoutedToMeSummary(session.user.officeId, session.user.id),
  ]);

  return NextResponse.json({
    overdue: arta.overdue,
    dueSoon: arta.dueSoon,
    routedToMe: routed.count,
    routedDocs: routed.docs,
  });
}
