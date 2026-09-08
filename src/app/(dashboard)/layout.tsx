import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getArtaAlertCounts } from "@/lib/artaAlerts";
import { getDeliveryQueue, getOutgoingReviewQueues, getRoutedToMeSummary } from "@/lib/notifications";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { dressDayFor } from "@/lib/dressCode";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Fetched fresh rather than read off the JWT, so a photo change shows up
  // immediately instead of waiting for the session token to be reissued.
  // The office is read from the session's officeId — never from anything the
  // client sends — so each unit's chrome names that unit and nothing else.
  const [{ overdue, dueSoon }, routed, review, deliveries, user, office] = await Promise.all([
    getArtaAlertCounts(session.user.officeId),
    getRoutedToMeSummary(session.user.officeId, session.user.id),
    getOutgoingReviewQueues(session.user.officeId, session.user.id, session.user.role),
    getDeliveryQueue(session.user.officeId),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { avatarUrl: true, isActive: true } }),
    prisma.office.findUnique({
      where: { id: session.user.officeId },
      select: {
        name: true,
        code: true,
        splitIncomingLedgers: true,
        tracksInternalMemos: true,
        tracksDtr: true,        tracksDipcr: true,
        tracksIpcrRatingGuide: true,
        tracksLegalAssistance: true,
        tracksRegulationLicensing: true,
        tracksSena: true,
        tracksCallLog: true,
      },
    }),
  ]);

  // Sign-in already refuses deactivated accounts, but a JWT issued before the
  // deactivation stays valid until it expires. This is the gate that makes
  // "deactivate" take effect immediately for someone already signed in.
  //
  // The two failure modes are reported differently on purpose. A token whose
  // user id isn't in this database at all is NOT a deactivated account — it's
  // a token minted against a different database (the dev server and the
  // deployed stack share a NEXTAUTH_SECRET but have separate user tables, so a
  // cookie set by one is accepted-then-orphaned by the other). Telling that
  // person "your account has been deactivated" sends them to their Division
  // Chief over what is really a stale cookie.
  if (!user) redirect("/login?stale=1");
  if (!user.isActive) redirect("/login?disabled=1");

  // Resolved per request, here rather than in the root layout: this layout is
  // already dynamic (it reads the session), so the day is recomputed on every
  // navigation without forcing the login page out of static rendering. The
  // variables it selects cascade from this element down to the sidebar.
  const dressDay = dressDayFor();

  return (
    <div className="flex" data-day={dressDay}>
      <Sidebar
        overdue={overdue}
        dueSoon={dueSoon}
        officeName={office?.name ?? "DMW Regional Office XIII"}
        officeCode={office?.code ?? "DMW"}
        splitIncomingLedgers={office?.splitIncomingLedgers ?? false}
        tracksInternalMemos={office?.tracksInternalMemos ?? false}
        tracksDtr={office?.tracksDtr ?? false}        tracksDipcr={office?.tracksDipcr ?? false}
        tracksIpcrRatingGuide={office?.tracksIpcrRatingGuide ?? false}
        tracksLegalAssistance={office?.tracksLegalAssistance ?? false}
        tracksRegulationLicensing={office?.tracksRegulationLicensing ?? false}
        tracksSena={office?.tracksSena ?? false}
        tracksCallLog={office?.tracksCallLog ?? false}
      />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar
          userName={session.user.name ?? "User"}
          userRole={session.user.role}
          avatarUrl={user?.avatarUrl ?? null}
          notifications={{
            overdue,
            dueSoon,
            routedToMe: routed.count,
            routedDocs: routed.docs,
            forChecking: review.forChecking.count,
            forCheckingDocs: review.forChecking.docs,
            returnedToMe: review.returned.count,
            returnedDocs: review.returned.docs,
            deliveries: deliveries.count,
            deliveryDocs: deliveries.docs,
          }}
        />
        {children}
      </div>
    </div>
  );
}
