import { getServerSession } from "next-auth";
import Link from "next/link";
import { Prisma, LeaveType } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Pagination } from "@/components/Pagination";
import { PlusIcon } from "@/components/icons";

const PAGE_SIZE = 20;

type SearchParams = { personnelId?: string; type?: string; page?: string };

// Server component: fetches directly via Prisma (no client-side fetch needed
// for the initial render), scoped to the logged-in user's office.
export default async function LeavePage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  const personnelId = searchParams.personnelId ?? "";
  const type = searchParams.type ?? "";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const where: Prisma.LeaveWhereInput = {
    officeId,
    ...(personnelId ? { personnelId } : {}),
    ...(type ? { type: type as LeaveType } : {}),
  };

  const [leaves, total, users] = await Promise.all([
    prisma.leave.findMany({
      where,
      orderBy: { leaveStart: "desc" },
      include: { personnel: { select: { name: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.leave.count({ where }),
    prisma.user.findMany({ where: { officeId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="space-y-4 p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Leave</h1>
        <Link href="/leave/new" className="btn-primary">
          <PlusIcon className="h-4 w-4" />
          New
        </Link>
      </div>

      <form action="/leave" method="get" className="flex gap-2">
        <select name="personnelId" defaultValue={personnelId} className="field-input w-auto">
          <option value="">All personnel</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={type} className="field-input w-auto">
          <option value="">All types</option>
          <option value="CTO">CTO</option>
          <option value="VACATION">Vacation</option>
          <option value="SICK">Sick</option>
          <option value="EMERGENCY">Emergency</option>
          <option value="OTHER">Other</option>
        </select>
        <button type="submit" className="btn-secondary">
          Filter
        </button>
      </form>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date filed</th>
              <th>Schedule of leave</th>
              <th>Type</th>
              <th>Personnel</th>
              <th>Scanned copy</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {leaves.map((leave) => {
              const schedule = leave.leaveEnd
                ? `${leave.leaveStart.toLocaleDateString()} – ${leave.leaveEnd.toLocaleDateString()}`
                : leave.leaveStart.toLocaleDateString();

              return (
                <tr key={leave.id}>
                  <td className="whitespace-nowrap">{leave.dateFiled?.toLocaleDateString() ?? "—"}</td>
                  <td className="whitespace-nowrap">{schedule}</td>
                  <td>{leave.type}</td>
                  <td>{leave.personnel.name}</td>
                  <td>
                    {leave.scannedCopyUrl ? (
                      <a href={`/api/files/${leave.scannedCopyUrl}`} target="_blank" rel="noreferrer" className="text-info hover:underline">
                        View
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <Link href={`/leave/${leave.id}`} className="font-medium text-primary hover:text-primary-600">
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination basePath="/leave" page={page} totalPages={totalPages} total={total} searchParams={{ personnelId, type }} />
    </main>
  );
}
