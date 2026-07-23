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

type DocketDoc = { id: string; routingNumber: string; documentTitle: string; dueDate: Date | null };

// The docket board is the dashboard's signature element — ARTA due dates rendered
// like case-file rows, with a stamp chip standing in for the office's ink stamp.
function DocketRow({ doc, tone }: { doc: DocketDoc; tone: "overdue" | "duesoon" }) {
  const rule = tone === "overdue" ? "bg-stamp" : "bg-duesoon";
  const chip = tone === "overdue" ? "stamp-chip-overdue" : "stamp-chip-duesoon";
  const label = tone === "overdue" ? "Overdue" : "Due soon";

  return (
    <li className="flex items-center gap-3 border-b border-ink-400/10 py-2.5 last:border-0 dark:border-white/10">
      <span className={`h-8 w-[3px] shrink-0 rounded-full ${rule}`} />
      <span className="min-w-0 flex-1">
        <Link href={`/incoming/${doc.id}`} className="block truncate font-mono text-sm font-semibold text-ink-900 hover:underline dark:text-white">
          {doc.routingNumber}
        </Link>
        <span className="block truncate text-xs text-ink-500 dark:text-white/40">{doc.documentTitle}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className={chip}>{label}</span>
        <span className="font-mono text-[11px] text-ink-500 dark:text-white/40">{doc.dueDate?.toLocaleDateString()}</span>
      </span>
    </li>
  );
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
      include: { routedTo: { include: { user: { select: { name: true } } } } },
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
        <h1 className="font-display text-xl font-semibold tracking-tight text-ink-900 dark:text-white">Dashboard</h1>
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500 dark:text-white/40">
          {today.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* ARTA compliance is the legally load-bearing metric of this system, so it leads —
          rendered as a docket board, since that's how due dates are actually tracked here. */}
      <section className="card overflow-hidden">
        <div className="card-header">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-ink-500 dark:text-white/40">
              Citizen&rsquo;s Charter deadlines
            </p>
            <h2 className="font-display text-base font-semibold text-ink-900 dark:text-white">ARTA compliance</h2>
          </div>
          {(overdueDocs.length > 0 || dueSoonDocs.length > 0) && (
            <p className="font-mono text-xs">
              {overdueDocs.length > 0 && <span className="font-semibold text-stamp dark:text-[#e0836f]">{overdueDocs.length} overdue</span>}
              {overdueDocs.length > 0 && dueSoonDocs.length > 0 && <span className="text-ink-400 dark:text-white/25"> · </span>}
              {dueSoonDocs.length > 0 && <span className="font-semibold text-duesoon dark:text-[#dcb256]">{dueSoonDocs.length} due soon</span>}
            </p>
          )}
        </div>
        <div className="p-5">
          {overdueDocs.length === 0 && dueSoonDocs.length === 0 ? (
            <p className="text-sm text-ink-500 dark:text-white/40">Nothing overdue or due soon. All caught up.</p>
          ) : (
            <div className="grid gap-x-8 sm:grid-cols-2">
              {overdueDocs.length > 0 && (
                <ul>
                  {overdueDocs.slice(0, 5).map((d) => (
                    <DocketRow key={d.id} doc={d} tone="overdue" />
                  ))}
                </ul>
              )}
              {dueSoonDocs.length > 0 && (
                <ul>
                  {dueSoonDocs.slice(0, 5).map((d) => (
                    <DocketRow key={d.id} doc={d} tone="duesoon" />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
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
            <h2 className="card-title font-display normal-case tracking-normal text-sm text-ink-900 dark:text-white">Recent incoming</h2>
            <Link href="/incoming" className="text-sm text-civic hover:text-civic-600 dark:text-civic-300 dark:hover:text-white">
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
                  <span className="whitespace-nowrap text-ink-500 dark:text-white/40">
                    {doc.routedTo.length > 0 ? doc.routedTo.map((r) => r.user.name).join(", ") : "Unassigned"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent outgoing */}
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="card-title font-display normal-case tracking-normal text-sm text-ink-900 dark:text-white">Recent outgoing</h2>
            <Link href="/outgoing" className="text-sm text-civic hover:text-civic-600 dark:text-civic-300 dark:hover:text-white">
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
            <h2 className="card-title font-display normal-case tracking-normal text-sm text-ink-900 dark:text-white">Recent activity</h2>
            <Link href="/activities" className="text-sm text-civic hover:text-civic-600 dark:text-civic-300 dark:hover:text-white">
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
                    <span className="font-mono text-xs text-ink-500 dark:text-white/40">{activity.date.toLocaleDateString()}</span>
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
            <h2 className="card-title font-display normal-case tracking-normal text-sm text-ink-900 dark:text-white">On leave now / this week</h2>
            <Link href="/leave" className="text-sm text-civic hover:text-civic-600 dark:text-civic-300 dark:hover:text-white">
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
                  <span className="whitespace-nowrap font-mono text-xs text-ink-500 dark:text-white/40">
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
