import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { officeTracksCallLog } from "@/lib/sena";
import { Pagination } from "@/components/Pagination";
import { PrintLink, listHref } from "@/components/PrintLink";
import { PrintToolbar } from "@/components/PrintToolbar";
import { PrintHeader } from "@/components/PrintHeader";
import { PlusIcon, SearchIcon } from "@/components/icons";

const PAGE_SIZE = 20;
const PRINT_MAX = 2000;

type SearchParams = { q?: string; page?: string; print?: string };

// Server component: fetches directly via Prisma (no client-side fetch needed
// for the initial render), scoped to the logged-in user's office.
export default async function CallLogPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  // Only offices keeping a telephone log have this module.
  if (!(await officeTracksCallLog(officeId))) notFound();

  const q = searchParams.q?.trim() ?? "";
  const isPrint = searchParams.print === "1";
  const page = Math.max(1, Number(searchParams.page) || 1);

  const where: Prisma.CallLogWhereInput = {
    officeId,
    ...(q
      ? {
          OR: [
            { callerName: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { phoneNumber: { contains: q } },
            { concern: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { remarks: { contains: q, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {}),
  };

  const [calls, total, office] = await Promise.all([
    prisma.callLog.findMany({
      where,
      orderBy: [{ callDate: "desc" }, { createdAt: "desc" }],
      skip: isPrint ? 0 : (page - 1) * PAGE_SIZE,
      take: isPrint ? PRINT_MAX : PAGE_SIZE,
    }),
    prisma.callLog.count({ where }),
    prisma.office.findUnique({ where: { id: officeId }, select: { name: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="p-6 lg:p-8">
      {isPrint ? (
        <>
          <PrintToolbar backHref={listHref("/call-log", { q })} />
          <PrintHeader
            officeName={office?.name ?? ""}
            title="Call log"
            filters={[{ label: "Search", value: q }]}
            total={total}
            generatedBy={session!.user.name ?? "—"}
            truncatedAt={PRINT_MAX}
          />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Call log</h1>
            <div className="flex gap-2">
              <PrintLink basePath="/call-log" searchParams={{ q }} />
              <Link href="/call-log/new" className="btn-primary">
                <PlusIcon className="h-4 w-4" />
                New
              </Link>
            </div>
          </div>

          <div className="mt-4">
            <form action="/call-log" method="get" className="flex flex-wrap gap-2">
              <div className="relative w-80">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/30" />
                <input
                  type="text"
                  name="q"
                  defaultValue={q}
                  placeholder="Search name, number, concern or remarks…"
                  className="field-input pl-9"
                />
              </div>
              <button type="submit" className="btn-dark">
                Search
              </button>
              {q && (
                <Link href="/call-log" className="btn-secondary">
                  Clear
                </Link>
              )}
            </form>
          </div>
        </>
      )}

      <div className={`card mt-4 overflow-x-auto ${isPrint ? "print:mt-0" : ""}`}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Number</th>
              <th>Name</th>
              <th>Concern</th>
              <th>Remarks</th>
              <th className="print:hidden"></th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap font-mono text-xs">
                  {c.callDate.toLocaleDateString("en-PH", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                </td>
                {/* Monospaced so a column of numbers lines up and a wrong digit
                    is visible at a glance. */}
                <td className="whitespace-nowrap font-mono text-xs">{c.phoneNumber}</td>
                <td>{c.callerName}</td>
                <td>{c.concern}</td>
                <td className="text-ink-500 dark:text-white/60">{c.remarks ?? "—"}</td>
                <td className="print:hidden">
                  <Link href={`/call-log/${c.id}`} className="text-sm text-info hover:underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {calls.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-ink-500 dark:text-white/40">
                  No calls logged{q ? " for this search" : " yet"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!isPrint && (
        <Pagination
          basePath="/call-log"
          page={page}
          totalPages={totalPages}
          total={total}
          searchParams={{ q }}
        />
      )}
    </main>
  );
}
