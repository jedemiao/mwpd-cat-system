import { getServerSession } from "next-auth";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Pagination } from "@/components/Pagination";
import { Badge } from "@/components/Badge";
import { PrintLink, listHref } from "@/components/PrintLink";
import { PrintToolbar } from "@/components/PrintToolbar";
import { PrintHeader } from "@/components/PrintHeader";
import { PlusIcon, SearchIcon } from "@/components/icons";

const PAGE_SIZE = 20;
const PRINT_MAX = 2000;

const STATUS_LABELS: Record<string, string> = { pending: "Pending", filed: "Filed" };

type SearchParams = { q?: string; status?: string; page?: string; print?: string };

// Server component: fetches directly via Prisma (no client-side fetch needed
// for the initial render), scoped to the logged-in user's office.
export default async function OutgoingPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  const q = searchParams.q?.trim() ?? "";
  const status = searchParams.status ?? "all";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const isPrint = searchParams.print === "1";

  const statusWhere: Prisma.OutgoingDocumentWhereInput =
    status === "filed" ? { filed: true } : status === "pending" ? { filed: false } : {};

  const where: Prisma.OutgoingDocumentWhereInput = {
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

  const [docs, total, office] = await Promise.all([
    prisma.outgoingDocument.findMany({
      where,
      orderBy: { dateReleased: "desc" },
      include: { relatedIncoming: { select: { routingNumber: true } } },
      skip: isPrint ? undefined : (page - 1) * PAGE_SIZE,
      take: isPrint ? PRINT_MAX : PAGE_SIZE,
    }),
    prisma.outgoingDocument.count({ where }),
    isPrint ? prisma.office.findUnique({ where: { id: officeId }, select: { name: true } }) : Promise.resolve(null),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const backHref = listHref("/outgoing", { q, status: status !== "all" ? status : undefined });

  return (
    <main className="space-y-4 p-6 lg:p-8">
      {isPrint ? (
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">
            Outgoing documents <span className="text-ink-400 dark:text-white/30">· print preview</span>
          </h1>
          <PrintToolbar backHref={backHref} />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Outgoing documents</h1>
          <div className="flex gap-2">
            <PrintLink basePath="/outgoing" searchParams={{ q, status: status !== "all" ? status : undefined }} />
            <Link href="/outgoing/new" className="btn-primary">
              <PlusIcon className="h-4 w-4" />
              New
            </Link>
          </div>
        </div>
      )}

      {isPrint && (
        <PrintHeader
          officeName={office?.name ?? ""}
          title="Outgoing documents"
          filters={[
            { label: "Search", value: q },
            { label: "Status", value: STATUS_LABELS[status] ?? "" },
          ]}
          total={total}
          generatedBy={session!.user.name ?? "—"}
          truncatedAt={PRINT_MAX}
        />
      )}

      {!isPrint && (
        <form action="/outgoing" method="get" className="flex gap-2">
          <div className="relative w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/30" />
            <input type="text" name="q" defaultValue={q} placeholder="Search routing number or title…" className="field-input pl-9" />
          </div>
          <select name="status" defaultValue={status} className="field-input w-auto">
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="filed">Filed</option>
          </select>
          <button type="submit" className="btn-dark">
            Search
          </button>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date released</th>
              <th>Routing number</th>
              <th>Document title</th>
              <th>Answers incoming #</th>
              <th>Received by</th>
              <th>Status</th>
              <th>Scanned copy</th>
              <th className="print:hidden"></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => (
              <tr key={doc.id}>
                <td className="whitespace-nowrap">{doc.dateReleased.toLocaleDateString()}</td>
                <td className="whitespace-nowrap font-mono text-xs">{doc.routingNumber}</td>
                <td>{doc.documentTitle}</td>
                <td className="whitespace-nowrap font-mono text-xs">{doc.relatedIncoming?.routingNumber ?? "—"}</td>
                <td>{doc.receivedBy ?? "—"}</td>
                <td className="whitespace-nowrap">
                  {doc.filed ? <Badge variant="success">Filed</Badge> : <Badge variant="warning">Pending</Badge>}
                </td>
                <td>
                  {isPrint ? (
                    doc.scannedCopyUrl ? (
                      "Yes"
                    ) : (
                      "—"
                    )
                  ) : doc.scannedCopyUrl ? (
                    <a href={`/api/files/${doc.scannedCopyUrl}`} target="_blank" rel="noreferrer" className="text-info hover:underline">
                      View
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="print:hidden">
                  <Link href={`/outgoing/${doc.id}`} className="font-medium text-primary hover:text-primary-600">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!isPrint && (
        <Pagination basePath="/outgoing" page={page} totalPages={totalPages} total={total} searchParams={{ q, status }} />
      )}
    </main>
  );
}
