import { getServerSession } from "next-auth";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Pagination } from "@/components/Pagination";
import { ActivityCalendar } from "./ActivityCalendar";
import { PlusIcon, SearchIcon } from "@/components/icons";

const PAGE_SIZE = 20;

type SearchParams = { q?: string; page?: string; view?: string; month?: string };

// Server component: fetches directly via Prisma (no client-side fetch needed
// for the initial render), scoped to the logged-in user's office.
export default async function ActivitiesPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  const q = searchParams.q?.trim() ?? "";
  const view = searchParams.view === "calendar" ? "calendar" : "list";
  const extraQuery = q ? `&q=${encodeURIComponent(q)}` : "";

  const searchWhere: Prisma.ActivityWhereInput = q
    ? {
        OR: [
          { activityName: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { remarks: { contains: q, mode: Prisma.QueryMode.insensitive } },
        ],
      }
    : {};

  const today = new Date();
  let calendarYear = today.getFullYear();
  let calendarMonth = today.getMonth(); // 0-indexed
  if (searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month)) {
    const [y, m] = searchParams.month.split("-").map(Number);
    calendarYear = y;
    calendarMonth = m - 1;
  }

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const where: Prisma.ActivityWhereInput = { officeId, ...searchWhere };

  const [activities, total] = await Promise.all([
    view === "list"
      ? prisma.activity.findMany({
          where,
          orderBy: { date: "desc" },
          include: { assignees: { include: { user: { select: { name: true } } } } },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        })
      : prisma.activity.findMany({
          // Match activities whose [date, endDate] range overlaps the visible
          // month at all, not just ones starting in it — a multi-day activity
          // that starts in June and runs into July must still show on July's
          // grid days. Uses AND (not a second top-level OR) so this doesn't
          // clobber the search filter's own OR above.
          where: {
            ...where,
            AND: [
              { date: { lt: new Date(calendarYear, calendarMonth + 1, 1) } },
              {
                OR: [
                  { endDate: null, date: { gte: new Date(calendarYear, calendarMonth, 1) } },
                  { endDate: { gte: new Date(calendarYear, calendarMonth, 1) } },
                ],
              },
            ],
          },
          orderBy: { date: "asc" },
          include: { assignees: { include: { user: { select: { name: true } } } } },
        }),
    view === "list" ? prisma.activity.count({ where }) : Promise.resolve(0),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="space-y-4 p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Monthly activity</h1>
        <Link href="/activities/new" className="btn-primary">
          <PlusIcon className="h-4 w-4" />
          New
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <form action="/activities" method="get" className="flex gap-2">
          {view === "calendar" && <input type="hidden" name="view" value="calendar" />}
          <div className="relative w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/30" />
            <input type="text" name="q" defaultValue={q} placeholder="Search activity or remarks…" className="field-input pl-9" />
          </div>
          <button type="submit" className="btn-dark">
            Search
          </button>
        </form>

        <div className="flex gap-2">
          <Link href={`/activities${q ? `?q=${encodeURIComponent(q)}` : ""}`} className={view === "list" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
            List
          </Link>
          <Link
            href={`/activities?view=calendar${extraQuery}`}
            className={view === "calendar" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
          >
            Calendar
          </Link>
        </div>
      </div>

      {view === "calendar" ? (
        <ActivityCalendar
          year={calendarYear}
          month={calendarMonth}
          extraQuery={extraQuery}
          activities={activities.map((activity) => ({
            id: activity.id,
            date: activity.date,
            endDate: activity.endDate,
            activityName: activity.activityName,
            assignees: activity.assignees.map((a) => ({ id: a.userId, name: a.user.name })),
          }))}
        />
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Activity</th>
                  <th>Person(s) incharge</th>
                  <th>Remarks</th>
                  <th>Supporting files</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {activities.map((activity) => {
                  const names = activity.assignees.map((a) => a.user.name).join(", ") || "—";
                  const files = [
                    activity.officeOrderUrl && { label: "Office Order", key: activity.officeOrderUrl },
                    activity.memoUrl && { label: "Memo", key: activity.memoUrl },
                    activity.inspectionReportUrl && { label: "Inspection Report", key: activity.inspectionReportUrl },
                  ].filter((f): f is { label: string; key: string } => Boolean(f));

                  return (
                    <tr key={activity.id}>
                      <td className="whitespace-nowrap">
                        {activity.date.toLocaleDateString()}
                        {activity.endDate && ` – ${activity.endDate.toLocaleDateString()}`}
                      </td>
                      <td>{activity.activityName}</td>
                      <td>{names}</td>
                      <td>{activity.remarks ?? "—"}</td>
                      <td>
                        {files.length > 0 ? (
                          files.map((f, i) => (
                            <span key={f.label}>
                              {i > 0 && ", "}
                              <a href={`/api/files/${f.key}`} target="_blank" rel="noreferrer" className="text-info hover:underline">
                                {f.label}
                              </a>
                            </span>
                          ))
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <Link href={`/activities/${activity.id}`} className="font-medium text-primary hover:text-primary-600">
                          Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination basePath="/activities" page={page} totalPages={totalPages} total={total} searchParams={{ q }} />
        </>
      )}
    </main>
  );
}
