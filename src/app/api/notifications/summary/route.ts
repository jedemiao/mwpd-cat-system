import { NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { getArtaAlertCounts } from "@/lib/artaAlerts";
import { getDeliveryQueue, getOutgoingReviewQueues, getRoutedToMeSummary } from "@/lib/notifications";

// Next's static analysis doesn't see the cookies() read that happens inside
// getServerSession (it's in the NextAuth library, not this file), so without
// this the route gets treated as cacheable and serves a stale snapshot to
// every user instead of a fresh one per request.
export const dynamic = "force-dynamic";

// Authoritative snapshot the notification bell re-fetches whenever a live
// event arrives, instead of hand-rolling increment/decrement math client-side.
export async function GET() {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [arta, routed, review, deliveries] = await Promise.all([
    getArtaAlertCounts(session.user.officeId),
    getRoutedToMeSummary(session.user.officeId, session.user.id),
    getOutgoingReviewQueues(session.user.officeId, session.user.id, session.user.role),
    getDeliveryQueue(session.user.officeId),
  ]);

  return NextResponse.json({
    overdue: arta.overdue,
    dueSoon: arta.dueSoon,
    routedToMe: routed.count,
    routedDocs: routed.docs,
    forChecking: review.forChecking.count,
    forCheckingDocs: review.forChecking.docs,
    returnedToMe: review.returned.count,
    returnedDocs: review.returned.docs,
    deliveries: deliveries.count,
    deliveryDocs: deliveries.docs,
  });
}
