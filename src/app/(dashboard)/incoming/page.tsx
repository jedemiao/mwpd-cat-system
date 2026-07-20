import { getServerSession } from "next-auth";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getArtaAlertDocuments } from "@/lib/artaAlerts";
import { Pagination } from "@/components/Pagination";
import { Badge } from "@/components/Badge";
import { PlusIcon, SearchIcon } from "@/components/icons";

const PAGE_SIZE = 20;

type SearchParams = { q?: string; status?: string; page?: string };

// Server component: fetches directly via Prisma (no client-side fetch needed
// for the initial render), scoped to the logged-in user's office.
export default async function IncomingPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  const q = searchParams.q?.trim() ?? "";
  const status = searchParams.status ?? "all";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const today = new Date();

  const statusWhere: Prisma.IncomingDocumentWhereInput =
    status === "overdue"
      ? { dateCompleted: null, dueDate: { lt: today } }
      : status === "pending"
        ? { dateCompleted: null, OR: [{ dueDate: null }, { dueDate: { gte: today } }] }
        : status === "completed"
          ? { dateCompleted: { not: null } }
          : {};

  const where: Prisma.IncomingDocumentWhereInput = {
    officeId,
    ...statusWhere,
    ...(q
      ? {
          OR: [
            { documentTitle: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { routingNumber: { contains: q, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {}),
  };

  const [docs, total, { overdueDocs, dueSoonDocs }] = await Promise.all([
    prisma.incomingDocument.findMany({
      where,
      orderBy: { dateReceived: "desc" },
      include: { routedTo: { select: { name: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.incomingDocument.count({ where }),
    getArtaAlertDocuments(officeId),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="space-y-4 p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Incoming documents</h1>
        <Link href="/incoming/new" className="btn-primary">
          <PlusIcon className="h-4 w-4" />
          New
        </Link>
      </div>

      {(overdueDocs.length > 0 || dueSoonDocs.length > 0) && (
        <div className="space-y-2">
          {overdueDocs.length > 0 && (
            <div className="rounded-md border border-danger/25 bg-danger-50 px-4 py-3 text-sm text-ink-700 dark:border-danger/20 dark:bg-danger/10 dark:text-white/70">
              <strong className="text-danger-600 dark:text-danger">{overdueDocs.length} overdue</strong> — past their ARTA due date:{" "}
              {overdueDocs.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ", "}
                  <Link href={`/incoming/${d.id}`} className="font-medium text-ink-900 underline decoration-danger/40 dark:text-white">
                    {d.routingNumber}
                  </Link>
                </span>
              ))}
            </div>
          )}
          {dueSoonDocs.length > 0 && (
            <div className="rounded-md border border-warning/30 bg-warning-50 px-4 py-3 text-sm text-ink-700 dark:border-warning/20 dark:bg-warning/10 dark:text-white/70">
              <strong className="text-[#92660c] dark:text-warning">{dueSoonDocs.length} due within 2 days</strong>:{" "}
              {dueSoonDocs.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ", "}
                  <Link href={`/incoming/${d.id}`} className="font-medium text-ink-900 underline decoration-warning/50 dark:text-white">
                    {d.routingNumber}
                  </Link>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <form action="/incoming" method="get" className="flex gap-2">
        <div className="relative w-72">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/30" />
          <input type="text" name="q" defaultValue={q} placeholder="Search routing number or title…" className="field-input pl-9" />
        </div>
        <select name="status" defaultValue={status} className="field-input w-auto">
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
          <option value="completed">Completed</option>
        </select>
        <button type="submit" className="btn-secondary">
          Search
        </button>
      </form>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date received</th>
              <th>Routing number</th>
              <th>Document title</th>
              <th>Routed to</th>
              <th>Due date</th>
              <th>Status</th>
              <th>Scanned copy</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => {
              const overdue = doc.dueDate && !doc.dateCompleted && doc.dueDate < today;
              return (
                <tr key={doc.id}>
                  <td className="whitespace-nowrap">{doc.dateReceived.toLocaleDateString()}</td>
                  <td className="whitespace-nowrap font-mono text-xs">{doc.routingNumber}</td>
                  <td>{doc.documentTitle}</td>
                  <td className="whitespace-nowrap">{doc.routedTo?.name ?? "—"}</td>
                  <td className="whitespace-nowrap">{doc.dueDate?.toLocaleDateString() ?? "—"}</td>
                  <td className="whitespace-nowrap">
                    {doc.dateCompleted ? (
                      <Badge variant="success">Completed</Badge>
                    ) : overdue ? (
                      <Badge variant="danger">Overdue</Badge>
                    ) : (
                      <Badge variant="warning">Pending</Badge>
                    )}
                  </td>
                  <td>
                    {doc.scannedCopyUrl ? (
                      <a href={`/api/files/${doc.scannedCopyUrl}`} target="_blank" rel="noreferrer" className="text-info hover:underline">
                        View
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <Link href={`/incoming/${doc.id}`} className="font-medium text-primary hover:text-primary-600">
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination basePath="/incoming" page={page} totalPages={totalPages} total={total} searchParams={{ q, status }} />
    </main>
  );
}
