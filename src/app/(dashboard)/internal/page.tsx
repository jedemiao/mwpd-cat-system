import { getServerSession } from "next-auth";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Pagination } from "@/components/Pagination";
import { Badge } from "@/components/Badge";
import { PlusIcon, SearchIcon } from "@/components/icons";

const PAGE_SIZE = 20;

type SearchParams = { q?: string; status?: string; page?: string };

// Server component: fetches directly via Prisma (no client-side fetch needed
// for the initial render), scoped to the logged-in user's office.
export default async function InternalPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  const q = searchParams.q?.trim() ?? "";
  const status = searchParams.status ?? "all";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

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

  const [memos, total] = await Promise.all([
    prisma.internalMemo.findMany({
      where,
      orderBy: { dateReleased: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.internalMemo.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="space-y-4 p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Internal memoranda</h1>
        <Link href="/internal/new" className="btn-primary">
          <PlusIcon className="h-4 w-4" />
          New
        </Link>
      </div>

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
        <button type="submit" className="btn-secondary">
          Search
        </button>
      </form>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date released</th>
              <th>Memo #</th>
              <th>Document title</th>
              <th>Received by</th>
              <th>Status</th>
              <th>Scanned copy</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {memos.map((memo) => (
              <tr key={memo.id}>
                <td className="whitespace-nowrap">{memo.dateReleased.toLocaleDateString()}</td>
                <td className="whitespace-nowrap font-mono text-xs">{memo.memorandumNumber}</td>
                <td>{memo.documentTitle}</td>
                <td>{memo.receivedBy ?? "—"}</td>
                <td className="whitespace-nowrap">
                  {memo.filed ? <Badge variant="success">Filed</Badge> : <Badge variant="warning">Pending</Badge>}
                </td>
                <td>
                  {memo.scannedCopyUrl ? (
                    <a href={`/api/files/${memo.scannedCopyUrl}`} target="_blank" rel="noreferrer" className="text-info hover:underline">
                      View
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <Link href={`/internal/${memo.id}`} className="font-medium text-primary hover:text-primary-600">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination basePath="/internal" page={page} totalPages={totalPages} total={total} searchParams={{ q, status }} />
    </main>
  );
}
