import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { officeTracksSena } from "@/lib/sena";
import {
  SENA_STATUSES,
  SENA_STATUS_LABELS,
  SENA_STATUS_CHIP,
  conferenceOrdinal,
  formatConferenceTime,
  isSenaStatus,
  type SenaStatusValue,
} from "@/lib/senaSchedule";
import { Pagination } from "@/components/Pagination";
import { PrintLink, listHref } from "@/components/PrintLink";
import { PrintToolbar } from "@/components/PrintToolbar";
import { PrintHeader } from "@/components/PrintHeader";
import { PlusIcon, SearchIcon } from "@/components/icons";
import { ClickableRow } from "@/components/ClickableRow";

const PAGE_SIZE = 20;
const PRINT_MAX = 2000;

type SearchParams = { q?: string; status?: string; page?: string; print?: string };

const peso = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Server component: fetches directly via Prisma (no client-side fetch needed
// for the initial render), scoped to the logged-in user's office.
export default async function SenaPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  // Only offices running SENA conciliation have this module.
  if (!(await officeTracksSena(officeId))) notFound();

  const q = searchParams.q?.trim() ?? "";
  const status = searchParams.status && isSenaStatus(searchParams.status) ? searchParams.status : "";
  const isPrint = searchParams.print === "1";
  const page = Math.max(1, Number(searchParams.page) || 1);

  const where: Prisma.SenaConferenceWhereInput = {
    officeId,
    ...(status ? { status: status as SenaStatusValue } : {}),
    ...(q
      ? {
          OR: [
            { complainant: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { respondent: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { mediator: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } },
          ],
        }
      : {}),
  };

  const [conferences, total, office, settledAgg] = await Promise.all([
    prisma.senaConference.findMany({
      where,
      orderBy: [{ conferenceDate: "desc" }, { conferenceTime: "asc" }],
      skip: isPrint ? 0 : (page - 1) * PAGE_SIZE,
      take: isPrint ? PRINT_MAX : PAGE_SIZE,
      include: {
        mediator: { select: { name: true } },
        previousConference: {
          select: { id: true, conferenceNumber: true, conferenceDate: true },
        },
      },
    }),
    prisma.senaConference.count({ where }),
    prisma.office.findUnique({ where: { id: officeId }, select: { name: true } }),
    // Totalled across the filtered set, settled conferences only. Because a
    // case's second conference is a separate row, this counts each settlement
    // once only if the register is kept that way — a settled amount belongs to
    // the sitting that produced it.
    prisma.senaConference.aggregate({
      where: { ...where, status: "SETTLED" },
      _sum: { amountSettled: true },
      _count: true,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const settledTotal = settledAgg._sum.amountSettled;

  return (
    <main className="p-6 lg:p-8">
      {isPrint ? (
        <>
          <PrintToolbar backHref={listHref("/sena", { q, status })} />
          <PrintHeader
            officeName={office?.name ?? ""}
            title="SENA conferences"
            filters={[
              { label: "Search", value: q },
              { label: "Status", value: status ? SENA_STATUS_LABELS[status] : "" },
            ]}
            total={total}
            generatedBy={session!.user.name ?? "—"}
            truncatedAt={PRINT_MAX}
          />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-ink-900 dark:text-white">SENA</h1>
            <div className="flex gap-2">
              <PrintLink basePath="/sena" searchParams={{ q, status }} />
              <Link href="/sena/new" className="btn-primary">
                <PlusIcon className="h-4 w-4" />
                New
              </Link>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <form action="/sena" method="get" className="flex flex-wrap gap-2">
              <div className="relative w-72">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/30" />
                <input
                  type="text"
                  name="q"
                  defaultValue={q}
                  placeholder="Search complainant, respondent or conciliator…"
                  className="field-input pl-9"
                />
              </div>
              <select name="status" defaultValue={status} className="field-input w-auto">
                <option value="">All statuses</option>
                {SENA_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {SENA_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-dark">
                Search
              </button>
              {(q || status) && (
                <Link href="/sena" className="btn-secondary">
                  Clear
                </Link>
              )}
            </form>
          </div>

          {/* The figure the register exists to produce. Shown against whatever
              filter is active, so "settled this status/search" is readable
              without exporting the table. */}
          {settledAgg._count > 0 && (
            <p className="mt-4 text-sm text-ink-500 dark:text-white/50">
              <span className="font-semibold text-ink-900 dark:text-white">
                ₱{peso.format(Number(settledTotal ?? 0))}
              </span>{" "}
              settled across {settledAgg._count}{" "}
              {settledAgg._count === 1 ? "conference" : "conferences"}
            </p>
          )}
        </>
      )}

      <div className={`card mt-4 overflow-x-auto ${isPrint ? "print:mt-0" : ""}`}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Mediator / Conciliator</th>
              <th>Complainant</th>
              <th>Respondent</th>
              <th>Conf.</th>
              <th>Time</th>
              <th>Status</th>
              <th className="text-right">Amount settled</th>
              <th className="print:hidden"></th>
            </tr>
          </thead>
          <tbody>
            {conferences.map((c) => (
              <ClickableRow key={c.id} href={`/sena/${c.id}`}>
                <td className="whitespace-nowrap font-mono text-xs">
                  {c.conferenceDate.toLocaleDateString("en-PH", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                </td>
                <td>{c.mediator.name}</td>
                <td>{c.complainant}</td>
                <td>{c.respondent}</td>
                <td className="whitespace-nowrap">
                  {conferenceOrdinal(c.conferenceNumber)}
                  {/* The link the sheet couldn't express, surfaced where it is
                      useful: this sitting continues an earlier one. */}
                  {c.previousConference && (
                    <Link
                      href={`/sena/${c.previousConference.id}`}
                      className="ml-1.5 text-xs text-info hover:underline print:hidden"
                      title="View the earlier conference for this case"
                    >
                      ↩ {conferenceOrdinal(c.previousConference.conferenceNumber)}
                    </Link>
                  )}
                </td>
                <td className="whitespace-nowrap font-mono text-xs">
                  {formatConferenceTime(c.conferenceTime)}
                </td>
                <td>
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${SENA_STATUS_CHIP[c.status as SenaStatusValue]}`}
                  >
                    {SENA_STATUS_LABELS[c.status as SenaStatusValue]}
                  </span>
                </td>
                <td className="whitespace-nowrap text-right font-mono text-xs tabular-nums">
                  {c.amountSettled ? `₱${peso.format(Number(c.amountSettled))}` : "—"}
                </td>
                <td className="print:hidden">
                  <Link href={`/sena/${c.id}`} className="text-sm text-info hover:underline">
                    Edit
                  </Link>
                </td>
              </ClickableRow>
            ))}
            {conferences.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-sm text-ink-500 dark:text-white/40">
                  No conferences recorded{q || status ? " for this filter" : " yet"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!isPrint && (
        <Pagination
          basePath="/sena"
          page={page}
          totalPages={totalPages}
          total={total}
          searchParams={{ q, status }}
        />
      )}
    </main>
  );
}
