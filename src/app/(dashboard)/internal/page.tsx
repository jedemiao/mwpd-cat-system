import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { officeTracksInternalMemos } from "@/lib/internalMemos";
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
export default async function InternalPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  // Only offices keeping an internal memorandum register have this module.
  if (!(await officeTracksInternalMemos(officeId))) notFound();

  const q = searchParams.q?.trim() ?? "";
  const status = searchParams.status ?? "all";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const isPrint = searchParams.print === "1";

  const statusWhere: Prisma.InternalMemoWhereInput =
    status === "filed" ? { filed: true } : status === "pending" ? { filed: false } : {};

  const memoNumberFilter = /^\d+$/.test(q) ? { memorandumNumber: parseInt(q, 10) } : undefined;

  const where: Prisma.InternalMemoWhereInput = {
    officeId,
    ...statusWhere,
    ...(q
      ? {
          OR: [
            { documentTitle: { contains: q, mode: Prisma.QueryMode.insensitive } },
            ...(memoNumberFilter ? [memoNumberFilter] : []),
          ],
        }
      : {}),
  };

  const [memos, total, office] = await Promise.all([
    prisma.internalMemo.findMany({
      where,
      orderBy: { dateReleased: "desc" },
      skip: isPrint ? undefined : (page - 1) * PAGE_SIZE,
      take: isPrint ? PRINT_MAX : PAGE_SIZE,
    }),
    prisma.internalMemo.count({ where }),
    isPrint ? prisma.office.findUnique({ where: { id: officeId }, select: { name: true } }) : Promise.resolve(null),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const backHref = listHref("/internal", { q, status: status !== "all" ? status : undefined });

  return (
    <main className="space-y-4 p-6 lg:p-8">
      {isPrint ? (
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">
            Internal memoranda <span className="text-ink-400 dark:text-white/30">· print preview</span>
          </h1>
          <PrintToolbar backHref={backHref} />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Internal memoranda</h1>
          <div className="flex gap-2">
            <PrintLink basePath="/internal" searchParams={{ q, status: status !== "all" ? status : undefined }} />
            <Link href="/internal/new" className="btn-primary">
              <PlusIcon className="h-4 w-4" />
              New
            </Link>
          </div>
        </div>
      )}

      {isPrint && (
        <PrintHeader
          officeName={office?.name ?? ""}
          title="Internal memoranda"
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
        <form action="/internal" method="get" className="flex gap-2">
          <div className="relative w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/30" />
            <input type="text" name="q" defaultValue={q} placeholder="Search memo number or title…" className="field-input pl-9" />
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
            {/* The office's internal memorandum register, column for column and
                in its order: Instruction and Progress were always collected by
                the form and stored on the row, but the ledger showed neither,
                so the two columns the Division Chief actually writes in were
                the two nobody could read back without opening each memo. */}
            <tr>
              <th>Date released</th>
              <th>Memorandum number</th>
              <th>Document title / subject</th>
              <th>Instruction / required actions</th>
              <th>Received by</th>
              <th>Progress / remarks</th>
              <th>Scanned copy</th>
              <th>Filed</th>
              <th className="print:hidden"></th>
            </tr>
          </thead>
          <tbody>
            {memos.map((memo) => (
              <tr key={memo.id}>
                <td className="whitespace-nowrap">{memo.dateReleased.toLocaleDateString()}</td>
                <td className="whitespace-nowrap font-mono text-xs">{memo.memorandumNumber}</td>
                <td>{memo.documentTitle}</td>
                <td>{memo.instructions ?? "—"}</td>
                <td>{memo.receivedBy ?? "—"}</td>
                <td>{memo.progressRemarks ?? "—"}</td>
                <td>
                  {isPrint ? (
                    memo.scannedCopyUrl ? (
                      "Yes"
                    ) : (
                      "—"
                    )
                  ) : memo.scannedCopyUrl ? (
                    <a href={`/api/files/${memo.scannedCopyUrl}`} target="_blank" rel="noreferrer" className="text-info hover:underline">
                      View
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                {/* Their register writes a bare YES here. The badge says the
                    same and also says the other thing, which a blank cell in a
                    spreadsheet leaves you to infer. */}
                <td className="whitespace-nowrap">
                  {memo.filed ? <Badge variant="success">Filed</Badge> : <Badge variant="warning">Pending</Badge>}
                </td>
                <td className="print:hidden">
                  <Link href={`/internal/${memo.id}`} className="font-medium text-primary hover:text-primary-600">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!isPrint && (
        <Pagination basePath="/internal" page={page} totalPages={totalPages} total={total} searchParams={{ q, status }} />
      )}
    </main>
  );
}
