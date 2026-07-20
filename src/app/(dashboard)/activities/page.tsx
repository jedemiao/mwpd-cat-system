import { getServerSession } from "next-auth";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Pagination } from "@/components/Pagination";
import { PlusIcon, SearchIcon } from "@/components/icons";

const PAGE_SIZE = 20;

type SearchParams = { q?: string; page?: string };

// Server component: fetches directly via Prisma (no client-side fetch needed
// for the initial render), scoped to the logged-in user's office.
export default async function ActivitiesPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const where: Prisma.ActivityWhereInput = {
    officeId,
    ...(q
      ? {
          OR: [
            { activityName: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { remarks: { contains: q, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {}),
  };

  const [activities, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      orderBy: { date: "desc" },
      include: { assignees: { include: { user: { select: { name: true } } } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.activity.count({ where }),
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

      <form action="/activities" method="get" className="flex gap-2">
        <div className="relative w-72">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/30" />
          <input type="text" name="q" defaultValue={q} placeholder="Search activity or remarks…" className="field-input pl-9" />
        </div>
        <button type="submit" className="btn-secondary">
          Search
        </button>
      </form>

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
                  <td className="whitespace-nowrap">{activity.date.toLocaleDateString()}</td>
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
    </main>
  );
}
