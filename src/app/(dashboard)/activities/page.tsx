import { getServerSession } from "next-auth";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Pagination } from "@/components/Pagination";
import { PrintLink, listHref } from "@/components/PrintLink";
import { PrintToolbar } from "@/components/PrintToolbar";
import { PrintHeader } from "@/components/PrintHeader";
import { ActivityCalendar } from "./ActivityCalendar";
import { PlusIcon, SearchIcon } from "@/components/icons";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_DOT,
  ACTIVITY_CATEGORY_LABELS,
  isActivityCategory,
  type ActivityCategoryValue,
} from "@/lib/activityCategories";
import { leaveTypeLabel } from "@/lib/leaveTypes";

const PAGE_SIZE = 20;
const PRINT_MAX = 2000;

type SearchParams = { q?: string; category?: string; page?: string; view?: string; month?: string; print?: string };

// Server component: fetches directly via Prisma (no client-side fetch needed
// for the initial render), scoped to the logged-in user's office.
export default async function ActivitiesPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  const q = searchParams.q?.trim() ?? "";
  const category = searchParams.category && isActivityCategory(searchParams.category) ? searchParams.category : "";
  const view = searchParams.view === "calendar" ? "calendar" : "list";
  const isPrint = searchParams.print === "1";
  // Carried through every calendar month link, so paging from July to August
  // doesn't silently drop the filter the clerk is looking at.
  const extraQuery =
    (q ? `&q=${encodeURIComponent(q)}` : "") + (category ? `&category=${encodeURIComponent(category)}` : "");

  const searchWhere: Prisma.ActivityWhereInput = q
    ? {
        OR: [
          { activityName: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { remarks: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { location: { contains: q, mode: Prisma.QueryMode.insensitive } },
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
  const where: Prisma.ActivityWhereInput = { officeId, ...searchWhere, ...(category ? { category } : {}) };

  const monthStart = new Date(calendarYear, calendarMonth, 1);
  const monthEnd = new Date(calendarYear, calendarMonth + 1, 1);

  const [activities, total, office, leaves] = await Promise.all([
    view === "list"
      ? prisma.activity.findMany({
          where,
          orderBy: { date: "desc" },
          include: { assignees: { include: { user: { select: { name: true } } } } },
          skip: isPrint ? undefined : (page - 1) * PAGE_SIZE,
          take: isPrint ? PRINT_MAX : PAGE_SIZE,
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
              { date: { lt: monthEnd } },
              {
                OR: [{ endDate: null, date: { gte: monthStart } }, { endDate: { gte: monthStart } }],
              },
            ],
          },
          orderBy: { date: "asc" },
          include: { assignees: { include: { user: { select: { name: true } } } } },
        }),
    view === "list" ? prisma.activity.count({ where }) : Promise.resolve(0),
    isPrint ? prisma.office.findUnique({ where: { id: officeId }, select: { name: true } }) : Promise.resolve(null),
    // Leave is projected onto the calendar, never stored as an activity — the
    // Leave module stays the only place it can be filed. Same overlap test as
    // the activity query above so a leave spanning a month boundary still
    // shows. Skipped when a category filter is on: the clerk asked for one
    // category, and leave is not one of them.
    view === "calendar" && !category
      ? prisma.leave.findMany({
          where: {
            officeId,
            AND: [
              { leaveStart: { lt: monthEnd } },
              { OR: [{ leaveEnd: null, leaveStart: { gte: monthStart } }, { leaveEnd: { gte: monthStart } }] },
            ],
            // The search box reads as "show me what matches" — leaving every
            // leave chip up during a search would bury the rows that matched.
            // A leave's searchable text is whose it is.
            ...(q ? { personnel: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } } : {}),
          },
          orderBy: { leaveStart: "asc" },
          include: { personnel: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const monthLabel = new Date(calendarYear, calendarMonth, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const monthParam = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}`;
  const backHref =
    view === "calendar"
      ? `/activities?view=calendar&month=${monthParam}${extraQuery}`
      : listHref("/activities", { q, category });
  // The calendar renders one month whole, so its printout is that month, not a
  // row count — hence the different header title and total between the views.
  const printTotal = view === "calendar" ? activities.length : total;

  return (
    <main className="space-y-4 p-6 lg:p-8">
      {isPrint ? (
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">
            Monthly activity <span className="text-ink-400 dark:text-white/30">· print preview</span>
          </h1>
          <PrintToolbar backHref={backHref} />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Monthly activity</h1>
            <div className="flex gap-2">
              <PrintLink
                basePath="/activities"
                searchParams={{
                  q,
                  category,
                  view: view === "calendar" ? "calendar" : undefined,
                  month: view === "calendar" ? monthParam : undefined,
                }}
              />
              <Link href="/activities/new" className="btn-primary">
                <PlusIcon className="h-4 w-4" />
                New
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <form action="/activities" method="get" className="flex flex-wrap gap-2">
              {view === "calendar" && <input type="hidden" name="view" value="calendar" />}
              {view === "calendar" && <input type="hidden" name="month" value={monthParam} />}
              <div className="relative w-72">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/30" />
                <input
                  type="text"
                  name="q"
                  defaultValue={q}
                  placeholder="Search activity, location or remarks…"
                  className="field-input pl-9"
                />
              </div>
              <select name="category" defaultValue={category} className="field-input w-auto">
                <option value="">All categories</option>
                {ACTIVITY_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {ACTIVITY_CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-dark">
                Search
              </button>
              {(q || category) && (
                <Link
                  href={view === "calendar" ? `/activities?view=calendar&month=${monthParam}` : "/activities"}
                  className="btn-secondary"
                >
                  Clear
                </Link>
              )}
            </form>

            <div className="flex gap-2">
              <Link href={listHref("/activities", { q, category })} className={view === "list" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
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
        </>
      )}

      {isPrint && (
        <PrintHeader
          officeName={office?.name ?? ""}
          title={view === "calendar" ? `Activity calendar — ${monthLabel}` : "Monthly activity"}
          filters={[
            { label: "Search", value: q },
            { label: "Category", value: category ? ACTIVITY_CATEGORY_LABELS[category] : "" },
          ]}
          total={printTotal}
          generatedBy={session!.user.name ?? "—"}
          truncatedAt={view === "list" ? PRINT_MAX : undefined}
        />
      )}

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
            category: activity.category as ActivityCategoryValue,
            location: activity.location,
            assignees: activity.assignees.map((a) => ({ id: a.userId, name: a.user.name })),
          }))}
          leaves={leaves.map((leave) => ({
            id: leave.id,
            personName: leave.personnel.name,
            typeLabel: leaveTypeLabel(leave.type, leave.typeOther),
            date: leave.leaveStart,
            endDate: leave.leaveEnd,
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
                  <th>Category</th>
                  <th>Person(s) incharge</th>
                  <th>Remarks</th>
                  <th>Supporting files</th>
                  <th className="print:hidden"></th>
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
                      <td>
                        {activity.activityName}
                        {/* Location rides under the activity name rather than
                            taking its own column — same treatment the incoming
                            ledger gives the sending agency, and it keeps this
                            table inside a printable width. */}
                        {activity.location && (
                          <div className="text-xs text-ink-500 dark:text-white/40">{activity.location}</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-sm print:hidden ${ACTIVITY_CATEGORY_DOT[activity.category as ActivityCategoryValue]}`}
                          />
                          {ACTIVITY_CATEGORY_LABELS[activity.category as ActivityCategoryValue]}
                        </span>
                      </td>
                      <td>{names}</td>
                      <td>{activity.remarks ?? "—"}</td>
                      <td>
                        {files.length === 0 ? (
                          "—"
                        ) : isPrint ? (
                          // On paper the useful fact is which supporting
                          // documents exist, not a link to fetch them.
                          files.map((f) => f.label).join(", ")
                        ) : (
                          files.map((f, i) => (
                            <span key={f.label}>
                              {i > 0 && ", "}
                              <a href={`/api/files/${f.key}`} target="_blank" rel="noreferrer" className="text-info hover:underline">
                                {f.label}
                              </a>
                            </span>
                          ))
                        )}
                      </td>
                      <td className="print:hidden">
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

          {!isPrint && (
            <Pagination basePath="/activities" page={page} totalPages={totalPages} total={total} searchParams={{ q, category }} />
          )}
        </>
      )}
    </main>
  );
}
