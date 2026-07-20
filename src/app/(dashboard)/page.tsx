import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getArtaAlertDocuments } from "@/lib/artaAlerts";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/Badge";
import { InboxIcon, SendIcon, ClipboardListIcon, UsersIcon } from "@/components/icons";

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default async function DashboardHomePage() {
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;
  const today = new Date();
  const weekAhead = addDays(today, 7);

  const [
    { overdueDocs, dueSoonDocs },
    incomingPendingCount,
    outgoingPendingCount,
    activitiesThisMonthCount,
    onLeaveCount,
    recentIncoming,
    recentOutgoing,
    recentActivities,
    upcomingLeave,
  ] = await Promise.all([
    getArtaAlertDocuments(officeId),
    prisma.incomingDocument.count({ where: { officeId, dateCompleted: null } }),
    prisma.outgoingDocument.count({ where: { officeId, filed: false } }),
    prisma.activity.count({
      where: { officeId, date: { gte: new Date(today.getFullYear(), today.getMonth(), 1) } },
    }),
    prisma.leave.count({
      where: { officeId, leaveStart: { lte: today }, OR: [{ leaveEnd: null }, { leaveEnd: { gte: today } }] },
    }),
    prisma.incomingDocument.findMany({
      where: { officeId },
      orderBy: { dateReceived: "desc" },
      take: 5,
      include: { routedTo: { select: { name: true } } },
    }),
    prisma.outgoingDocument.findMany({
      where: { officeId },
      orderBy: { dateReleased: "desc" },
      take: 5,
    }),
    prisma.activity.findMany({
      where: { officeId },
      orderBy: { date: "desc" },
      take: 5,
      include: { assignees: { include: { user: { select: { name: true } } } } },
    }),
    prisma.leave.findMany({
      where: {
        officeId,
        OR: [{ leaveEnd: { gte: today } }, { leaveEnd: null, leaveStart: { gte: today, lte: weekAhead } }],
      },
      orderBy: { leaveStart: "asc" },
      take: 5,
      include: { personnel: { select: { name: true } } },
    }),
  ]);

  return (
    <main className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-ink-500 dark:text-white/40">
          {today.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* ARTA compliance is the legally load-bearing metric of this system, so it leads. */}
      <section className="card p-5">
        <h2 className="card-title mb-3">ARTA compliance</h2>
        {overdueDocs.length === 0 && dueSoonDocs.length === 0 ? (
          <p className="text-sm text-ink-500 dark:text-white/40">Nothing overdue or due soon. All caught up.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {overdueDocs.length > 0 && (
              <div className="rounded-md border border-danger/25 bg-danger-50 px-4 py-3 dark:border-danger/20 dark:bg-danger/10">
                <p className="text-sm font-medium text-danger-600 dark:text-danger">{overdueDocs.length} overdue</p>
                <ul className="mt-2 space-y-1 text-sm text-ink-700 dark:text-white/70">
                  {overdueDocs.slice(0, 5).map((d) => (
                    <li key={d.id}>
                      <Link href={`/incoming/${d.id}`} className="font-medium text-ink-900 dark:text-white underline decoration-danger/40">
                        {d.routingNumber}
                      </Link>{" "}
                      <span className="text-danger-600 dark:text-danger">— due {d.dueDate?.toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {dueSoonDocs.length > 0 && (
              <div className="rounded-md border border-warning/30 bg-warning-50 px-4 py-3 dark:border-warning/20 dark:bg-warning/10">
                <p className="text-sm font-medium text-[#92660c] dark:text-warning">{dueSoonDocs.length} due within 2 days</p>
                <ul className="mt-2 space-y-1 text-sm text-ink-700 dark:text-white/70">
                  {dueSoonDocs.slice(0, 5).map((d) => (
                    <li key={d.id}>
                      <Link href={`/incoming/${d.id}`} className="font-medium text-ink-900 dark:text-white underline decoration-warning/50">
                        {d.routingNumber}
                      </Link>{" "}
                      <span className="text-[#92660c] dark:text-warning">— due {d.dueDate?.toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Quick stats */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          value={incomingPendingCount}
          label="Incoming pending"
          href="/incoming?status=pending"
          tone="primary"
          icon={<InboxIcon className="h-8 w-8" />}
        />
        <StatCard
          value={outgoingPendingCount}
          label="Outgoing pending"
          href="/outgoing?status=pending"
          tone="info"
          icon={<SendIcon className="h-8 w-8" />}
        />
        <StatCard
          value={activitiesThisMonthCount}
          label="Activities this month"
          href="/activities"
          tone="warning"
          icon={<ClipboardListIcon className="h-8 w-8" />}
        />
        <StatCard
          value={onLeaveCount}
          label="On leave today"
          href="/leave"
          tone="danger"
          icon={<UsersIcon className="h-8 w-8" />}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent incoming */}
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="card-title">Recent incoming</h2>
            <Link href="/incoming" className="text-sm text-primary hover:text-primary-600">
              View all
            </Link>
          </div>
          {recentIncoming.length === 0 ? (
            <p className="text-sm text-ink-500 dark:text-white/40">No incoming documents yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recentIncoming.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between border-b border-ink-400/10 dark:border-white/10 pb-2 last:border-0 last:pb-0">
                  <span>
                    <Link href={`/incoming/${doc.id}`} className="font-mono text-ink-900 dark:text-white hover:underline">
                      {doc.routingNumber}
                    </Link>{" "}
                    <span className="text-ink-500 dark:text-white/40">{doc.documentTitle}</span>
                  </span>
                  <span className="whitespace-nowrap text-ink-500 dark:text-white/40">{doc.routedTo?.name ?? "Unassigned"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent outgoing */}
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="card-title">Recent outgoing</h2>
            <Link href="/outgoing" className="text-sm text-primary hover:text-primary-600">
              View all
            </Link>
          </div>
          {recentOutgoing.length === 0 ? (
            <p className="text-sm text-ink-500 dark:text-white/40">No outgoing documents yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recentOutgoing.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between border-b border-ink-400/10 dark:border-white/10 pb-2 last:border-0 last:pb-0">
                  <span>
                    <Link href={`/outgoing/${doc.id}`} className="font-mono text-ink-900 dark:text-white hover:underline">
                      {doc.routingNumber}
                    </Link>{" "}
                    <span className="text-ink-500 dark:text-white/40">{doc.documentTitle}</span>
                  </span>
                  <span className="whitespace-nowrap">
                    {doc.filed ? <Badge variant="success">Filed</Badge> : <Badge variant="warning">Pending</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent activities */}
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="card-title">Recent activity</h2>
            <Link href="/activities" className="text-sm text-primary hover:text-primary-600">
              View all
            </Link>
          </div>
          {recentActivities.length === 0 ? (
            <p className="text-sm text-ink-500 dark:text-white/40">No activities logged yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recentActivities.map((activity) => (
                <li key={activity.id} className="flex items-center justify-between border-b border-ink-400/10 dark:border-white/10 pb-2 last:border-0 last:pb-0">
                  <span>
                    <Link href={`/activities/${activity.id}`} className="text-ink-900 dark:text-white hover:underline">
                      {activity.activityName}
                    </Link>{" "}
                    <span className="text-ink-500 dark:text-white/40">{activity.date.toLocaleDateString()}</span>
                  </span>
                  <span className="whitespace-nowrap text-ink-500 dark:text-white/40">
                    {activity.assignees.map((a) => a.user.name).join(", ") || "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Staff availability */}
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="card-title">On leave now / this week</h2>
            <Link href="/leave" className="text-sm text-primary hover:text-primary-600">
              View all
            </Link>
          </div>
          {upcomingLeave.length === 0 ? (
            <p className="text-sm text-ink-500 dark:text-white/40">No one is on leave right now or within the next 7 days.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {upcomingLeave.map((leave) => (
                <li key={leave.id} className="flex items-center justify-between border-b border-ink-400/10 dark:border-white/10 pb-2 last:border-0 last:pb-0">
                  <span className="text-ink-900 dark:text-white">{leave.personnel.name}</span>
                  <span className="whitespace-nowrap text-ink-500 dark:text-white/40">
                    {leave.leaveStart.toLocaleDateString()}
                    {leave.leaveEnd ? ` – ${leave.leaveEnd.toLocaleDateString()}` : ""} · {leave.type}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
