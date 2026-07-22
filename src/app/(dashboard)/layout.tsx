import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getArtaAlertCounts } from "@/lib/artaAlerts";
import { getRoutedToMeSummary } from "@/lib/notifications";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Fetched fresh rather than read off the JWT, so a photo change shows up
  // immediately instead of waiting for the session token to be reissued.
  const [{ overdue, dueSoon }, routed, user] = await Promise.all([
    getArtaAlertCounts(session.user.officeId),
    getRoutedToMeSummary(session.user.officeId, session.user.id),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { avatarUrl: true } }),
  ]);

  return (
    <div className="flex">
      <Sidebar overdue={overdue} dueSoon={dueSoon} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar
          userName={session.user.name ?? "User"}
          userRole={session.user.role}
          avatarUrl={user?.avatarUrl ?? null}
          notifications={{ overdue, dueSoon, routedToMe: routed.count, routedDocs: routed.docs }}
        />
        {children}
      </div>
    </div>
  );
}
