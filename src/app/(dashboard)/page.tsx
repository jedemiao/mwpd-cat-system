import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getArtaAlertDocuments } from "@/lib/artaAlerts";
import { getOfficePipeline } from "@/lib/correspondencePipeline";
import { PipelineBoard } from "@/components/PipelineBoard";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/Badge";
import { InboxIcon, SendIcon, ClipboardListIcon, UsersIcon } from "@/components/icons";
import { ActivityCalendar } from "./activities/ActivityCalendar";
import { type ActivityCategoryValue } from "@/lib/activityCategories";
import { leaveTypeLabel } from "@/lib/leaveTypes";

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

  // The dashboard always shows the current month; paging lives on /activities,
  // which is where someone goes to actually work with the calendar.
  const calendarYear = today.getFullYear();
  const calendarMonth = today.getMonth();
  const monthStart = new Date(calendarYear, calendarMonth, 1);
  const monthEnd = new Date(calendarYear, calendarMonth + 1, 1);

  const [
    { overdueDocs, dueSoonDocs },
    office,
    pipeline,
    monthActivities,
    monthLeaves,
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
    prisma.office.findUnique({
      where: { id: officeId },
      select: { tracksArta: true, tracksCorrespondencePipeline: true, incomingRegisterForm: true },
    }),
    getOfficePipeline(officeId),
    // Same overlap test the /activities calendar uses, so a multi-day activity
    // running across a month boundary still appears on this month's grid.
    prisma.activity.findMany({
      where: {
        officeId,
        AND: [
          { date: { lt: monthEnd } },
          { OR: [{ endDate: null, date: { gte: monthStart } }, { endDate: { gte: monthStart } }] },
        ],
      },
      orderBy: { date: "asc" },
      include: { assignees: { include: { user: { select: { name: true } } } } },
    }),
    // Leave is projected onto the calendar, never stored as an activity.
    prisma.leave.findMany({
      where: {
        officeId,
        AND: [
          { leaveStart: { lt: monthEnd } },
          { OR: [{ leaveEnd: null, leaveStart: { gte: monthStart } }, { leaveEnd: { gte: monthStart } }] },
        ],
      },
      orderBy: { leaveStart: "asc" },
      include: { personnel: { select: { name: true } } },
    }),
    prisma.incomingDocument.count({ where: { officeId, dateCompleted: null } }),
    // Dispatches awaiting filing. A draft has not been dispatched at all, so
    // it is not "awaiting" anything a clerk can act on — counting it here would
    // inflate the tile with other people's unfinished work.
    prisma.outgoingDocument.count({ where: { officeId, status: "RELEASED", filed: false } }),
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
    // Recently dispatched — drafts and documents still in review have no
    // release date to sort by and have not been dispatched.
    prisma.outgoingDocument.findMany({
      where: { officeId, status: "RELEASED" },
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

      {/* Two boards, in the order the office asks the questions. The pipeline
          leads because "where is everything sitting" is the standing question —
          it has an answer every day of the year, and it is the one the ledger
          view cannot give. ARTA follows because it is the sharper question but
          not the constant one: on a good week it is empty, and an empty board
          should not be what greets the division at the top of the page.

          Both are opt-in per office (Office.tracksCorrespondencePipeline,
          Office.tracksArta). A division carrying neither drops straight to the
          month calendar, which is its real working view. */}
      {office?.tracksCorrespondencePipeline && (
        <PipelineBoard stages={pipeline.stages} counts={pipeline.counts} />
      )}

      {/* ARTA compliance is the legally load-bearing metric for the office that
          carries it — rendered as a docket board, since that's how due dates
          are actually tracked here. Only MWPTD is subject to ARTA; for the
          exempt divisions this whole board is omitted rather than shown empty. */}
      {office?.tracksArta && (
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
      )}

      {/* The month at a glance — activities colour-coded by category with leave
          projected on. This is the working view for the divisions whose output
          is events rather than correspondence, so it sits high on the page;
          /activities is where it can be paged, filtered and printed. */}
      <section className="card overflow-hidden">
        <div className="card-header">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-ink-500 dark:text-white/40">
              This month
            </p>
            <h2 className="font-display text-base font-semibold text-ink-900 dark:text-white">
              {monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </h2>
          </div>
          <Link
            href={`/activities?view=calendar&month=${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}`}
            className="text-sm text-civic hover:text-civic-600 dark:text-civic-300 dark:hover:text-white"
          >
            Open calendar
          </Link>
        </div>
        <ActivityCalendar
          year={calendarYear}
          month={calendarMonth}
          extraQuery=""
          activities={monthActivities.map((activity) => ({
            id: activity.id,
            date: activity.date,
            endDate: activity.endDate,
            activityName: activity.activityName,
            category: activity.category as ActivityCategoryValue,
            categoryOther: activity.categoryOther,
            location: activity.location,
            assignees: activity.assignees.map((a) => ({ id: a.userId, name: a.user.name })),
          }))}
          leaves={monthLeaves.map((leave) => ({
            id: leave.id,
            personName: leave.personnel.name,
            typeLabel: leaveTypeLabel(leave.type, leave.typeOther),
            date: leave.leaveStart,
            endDate: leave.leaveEnd,
          }))}
        />
      </section>

      {/* Quick stats. "Incoming pending" is dropped where the pipeline board is
          shown: pending is exactly the sum of the board's first three stages,
          and a total sitting beside its own parts invites the reader to check
          whether they add up instead of reading either. Offices without the
          board keep the card, which is their only view of that number. */}
      <section
        className={`grid grid-cols-2 gap-4 ${
          office?.tracksCorrespondencePipeline ? "sm:grid-cols-3" : "sm:grid-cols-4"
        }`}
      >
        {!office?.tracksCorrespondencePipeline && (
          <StatCard
            value={incomingPendingCount}
            label="Incoming pending"
            href="/incoming?status=pending"
            tone="primary"
            icon={<InboxIcon className="h-8 w-8" />}
          />
        )}
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
