import { getServerSession } from "next-auth";
import Link from "next/link";
import { Prisma, LeaveType } from "@prisma/client";
import { scannedCopyFileName } from "@/lib/scannedCopy";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Pagination } from "@/components/Pagination";
import { PrintLink, listHref } from "@/components/PrintLink";
import { PrintToolbar } from "@/components/PrintToolbar";
import { PrintHeader } from "@/components/PrintHeader";
import { PlusIcon } from "@/components/icons";
import { LEAVE_TYPE_LABELS, leaveTypeLabel } from "@/lib/leaveTypes";
import { ClickableRow } from "@/components/ClickableRow";

const PAGE_SIZE = 20;
const PRINT_MAX = 2000;

type SearchParams = { personnelId?: string; type?: string; page?: string; print?: string };

// Server component: fetches directly via Prisma (no client-side fetch needed
// for the initial render), scoped to the logged-in user's office.
export default async function LeavePage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  const personnelId = searchParams.personnelId ?? "";
  const type = searchParams.type ?? "";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const isPrint = searchParams.print === "1";

  const where: Prisma.LeaveWhereInput = {
    officeId,
    ...(personnelId ? { personnelId } : {}),
    ...(type ? { type: type as LeaveType } : {}),
  };

  const [leaves, total, users, office] = await Promise.all([
    prisma.leave.findMany({
      where,
      // Tie-broken by entry order — see the incoming register: several people
      // commonly start leave on the same day, which sorts them equal.
      orderBy: [{ leaveStart: "desc" }, { createdAt: "desc" }],
      include: { personnel: { select: { name: true } } },
      skip: isPrint ? undefined : (page - 1) * PAGE_SIZE,
      take: isPrint ? PRINT_MAX : PAGE_SIZE,
    }),
    prisma.leave.count({ where }),
    prisma.user.findMany({ where: { officeId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    isPrint ? prisma.office.findUnique({ where: { id: officeId }, select: { name: true } }) : Promise.resolve(null),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const backHref = listHref("/leave", { personnelId, type });
  // The URL carries a personnel id; the printed header has to name the person.
  const personnelName = personnelId ? (users.find((u) => u.id === personnelId)?.name ?? "") : "";

  return (
    <main className="space-y-4 p-6 lg:p-8">
      {isPrint ? (
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">
            Leave <span className="text-ink-400 dark:text-white/30">· print preview</span>
          </h1>
          <PrintToolbar backHref={backHref} />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Leave</h1>
          <div className="flex gap-2">
            <PrintLink basePath="/leave" searchParams={{ personnelId, type }} />
            <Link href="/leave/new" className="btn-primary">
              <PlusIcon className="h-4 w-4" />
              New
            </Link>
          </div>
        </div>
      )}

      {isPrint && (
        <PrintHeader
          officeName={office?.name ?? ""}
          title="Leave records"
          filters={[
            { label: "Personnel", value: personnelName },
            { label: "Type", value: LEAVE_TYPE_LABELS[type] ?? "" },
          ]}
          total={total}
          generatedBy={session!.user.name ?? "—"}
          truncatedAt={PRINT_MAX}
        />
      )}

      {!isPrint && (
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
          <button type="submit" className="btn-dark">
            Filter
          </button>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date filed</th>
              <th>Schedule of leave</th>
              <th>Type</th>
              <th>Personnel</th>
              <th>Scanned copy</th>
              <th className="print:hidden"></th>
            </tr>
          </thead>
          <tbody>
            {leaves.map((leave) => {
              const schedule = leave.leaveEnd
                ? `${leave.leaveStart.toLocaleDateString()} – ${leave.leaveEnd.toLocaleDateString()}`
                : leave.leaveStart.toLocaleDateString();

              return (
                <ClickableRow key={leave.id} href={`/leave/${leave.id}`}>
                  <td className="whitespace-nowrap">{leave.dateFiled?.toLocaleDateString() ?? "—"}</td>
                  <td className="whitespace-nowrap">{schedule}</td>
                  <td>{leaveTypeLabel(leave.type, leave.typeOther)}</td>
                  <td>{leave.personnel.name}</td>
                  <td>
                    {isPrint ? (
                      leave.scannedCopyUrl ? (
                        "Yes"
                      ) : (
                        "—"
                      )
                    ) : leave.scannedCopyUrl ? (
                      <a
                        href={`/api/files/${leave.scannedCopyUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        title={scannedCopyFileName(leave.scannedCopyUrl)}
                        // The name can be long and this is one column among many, so it is
                        // clipped to the column rather than allowed to widen the table; the
                        // title above gives the whole thing on hover.
                        className="block max-w-[14rem] truncate text-info hover:underline"
                      >
                        {scannedCopyFileName(leave.scannedCopyUrl)}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="print:hidden">
                    <Link href={`/leave/${leave.id}`} className="font-medium text-primary hover:text-primary-600">
                      Edit
                    </Link>
                  </td>
                </ClickableRow>
              );
            })}
          </tbody>
        </table>
      </div>

      {!isPrint && (
        <Pagination basePath="/leave" page={page} totalPages={totalPages} total={total} searchParams={{ personnelId, type }} />
      )}
    </main>
  );
}
