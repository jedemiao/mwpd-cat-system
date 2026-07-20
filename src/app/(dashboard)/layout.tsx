import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getArtaAlertCounts } from "@/lib/artaAlerts";
import { getRoutedToMeSummary } from "@/lib/notifications";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [{ overdue, dueSoon }, routed] = await Promise.all([
    getArtaAlertCounts(session.user.officeId),
    getRoutedToMeSummary(session.user.officeId, session.user.id),
  ]);

  return (
    <div className="flex">
      <Sidebar overdue={overdue} dueSoon={dueSoon} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar
          userName={session.user.name ?? "User"}
          userRole={session.user.role}
          notifications={{ overdue, dueSoon, routedToMe: routed.count, routedDocs: routed.docs }}
        />
        {children}
      </div>
    </div>
  );
}
