import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { monthHeading, monthRange } from "@/lib/legalAssistance";
import {
  RL_SERVICES,
  RL_SERVICE_LABELS,
  RL_SERVICE_SHORT,
  officeTracksRegulationLicensing,
} from "@/lib/regulationLicensing";
import { Pagination } from "@/components/Pagination";
import { PrintLink, listHref } from "@/components/PrintLink";
import { PrintToolbar } from "@/components/PrintToolbar";
import { PrintHeader } from "@/components/PrintHeader";
import { PlusIcon, SearchIcon } from "@/components/icons";

const PAGE_SIZE = 20;
const PRINT_MAX = 2000;

type SearchParams = {
  q?: string;
  personnel?: string;
  year?: string;
  month?: string;
  page?: string;
  print?: string;
};

export default async function RegulationLicensingPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  // Only offices running the regulation and licensing desk have this module.
  if (!(await officeTracksRegulationLicensing(officeId))) notFound();

  const q = searchParams.q?.trim() ?? "";
  const person = searchParams.personnel ?? "";
  const isPrint = searchParams.print === "1";
  const page = Math.max(1, Number(searchParams.page) || 1);

  const year = /^\d{4}$/.test(searchParams.year ?? "") ? parseInt(searchParams.year!, 10) : null;
  const month = /^(1[0-2]|[1-9])$/.test(searchParams.month ?? "")
    ? parseInt(searchParams.month!, 10)
    : null;
  const period = year && month ? monthRange(year, month) : null;

  const where: Prisma.RegulationLicensingWhereInput = {
    officeId,
    ...(person ? { personnelId: person } : {}),
    ...(period ? { serviceDate: period } : {}),
    ...(q
      ? {
          OR: [
            { requestingParty: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { personnel: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } },
          ],
        }
      : {}),
  };

  const [rows, total, office, staff] = await Promise.all([
    prisma.regulationLicensing.findMany({
      where,
      // Tie-broken by entry order: serviceDate carries no time, so a day's
      // callers sort equal and would otherwise drift between requests — which
      // under skip/take also breaks pagination.
      orderBy: [{ serviceDate: "desc" }, { createdAt: "desc" }],
      skip: isPrint ? 0 : (page - 1) * PAGE_SIZE,
      take: isPrint ? PRINT_MAX : PAGE_SIZE,
      include: { personnel: { select: { name: true } } },
    }),
    prisma.regulationLicensing.count({ where }),
    prisma.office.findUnique({ where: { id: officeId }, select: { name: true } }),
    prisma.user.findMany({
      where: { officeId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const query = {
    ...(q ? { q } : {}),
    ...(person ? { personnel: person } : {}),
    ...(year && month ? { year: String(year), month: String(month) } : {}),
  };

  return (
    <main className="space-y-4 p-6 lg:p-8">
      {isPrint ? (
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">
            Regulation and Licensing{" "}
            <span className="text-ink-400 dark:text-white/30">· print preview</span>
          </h1>
          <PrintToolbar backHref={listHref("/regulation-licensing", query)} />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink-900 dark:text-white">
              Regulation and Licensing
            </h1>
            <p className="font-mono text-xs uppercase tracking-wide text-ink-500 dark:text-white/40">
              {period ? monthHeading(year!, month!) : "All months"} · {total} request
              {total === 1 ? "" : "s"} served
            </p>
          </div>
          <div className="flex gap-2">
            <PrintLink basePath="/regulation-licensing" searchParams={query} />
            <Link href="/regulation-licensing/new" className="btn-primary">
              <PlusIcon className="h-4 w-4" />
              New
            </Link>
          </div>
        </div>
      )}

      {isPrint && (
        <PrintHeader
          officeName={office?.name ?? ""}
          title="Regulation and Licensing Register"
          filters={[
            { label: "Period", value: period ? monthHeading(year!, month!) : "All months" },
            { label: "Personnel", value: staff.find((s) => s.id === person)?.name ?? "All" },
            { label: "Search", value: q || "—" },
          ]}
          total={total}
          generatedBy={session!.user.name ?? "—"}
        />
      )}

      {!isPrint && (
        <form action="/regulation-licensing" method="get" className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/30" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Requesting party or personnel"
              className="field-input w-64 pl-9"
            />
          </div>
          <select name="personnel" defaultValue={person} className="field-input w-auto">
            <option value="">All personnel</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            name="year"
            defaultValue={year ?? ""}
            min={2000}
            max={2100}
            placeholder="Year"
            className="field-input w-24"
            aria-label="Year"
          />
          <select name="month" defaultValue={month ?? ""} className="field-input w-auto">
            <option value="">All months</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {monthHeading(2026, m).replace(" 2026", "")}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-dark">
            Search
          </button>
          <Link href="/regulation-licensing" className="btn-secondary">
            Clear
          </Link>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            {/* Two header rows, as the sheet has them: M and F sit under one
                "Sex" span, and the six tick columns under one heading, rather
                than reading as eight unrelated columns. */}
            <tr>
              <th rowSpan={2}>Date</th>
              <th rowSpan={2}>Personnel</th>
              <th rowSpan={2}>Requesting party</th>
              <th colSpan={2} className="text-center">
                Sex
              </th>
              <th colSpan={RL_SERVICES.length} className="text-center">
                Service rendered
              </th>
              <th rowSpan={2} className="print:hidden"></th>
            </tr>
            <tr>
              <th className="text-center">M</th>
              <th className="text-center">F</th>
              {/* Shortened headings with the sheet's full wording on hover: at
                  six tick columns the register is already wide, and the long
                  forms would each be wider than the tick beneath them. */}
              {RL_SERVICES.map((service) => (
                <th key={service} className="text-center" title={RL_SERVICE_LABELS[service]}>
                  {RL_SERVICE_SHORT[service]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={RL_SERVICES.length + 5} className="text-ink-500 dark:text-white/40">
                  Nothing recorded{period ? ` for ${monthHeading(year!, month!)}` : ""} yet.
                </td>
              </tr>
            )}

            {rows.map((row) => {
              const given = new Set(row.services);
              return (
                <tr key={row.id}>
                  <td className="whitespace-nowrap">
                    {row.serviceDate.toLocaleDateString("en-US", { timeZone: "UTC" })}
                  </td>
                  <td className="whitespace-nowrap">{row.personnel.name}</td>
                  <td className="font-medium text-ink-900 dark:text-white">{row.requestingParty}</td>
                  {/* A tick or nothing, the way the sheet reads. A dash in every
                      empty box would turn a register that is mostly empty boxes
                      into a wall of punctuation. */}
                  <td className="text-center">{row.sex === "MALE" ? "✓" : ""}</td>
                  <td className="text-center">{row.sex === "FEMALE" ? "✓" : ""}</td>
                  {RL_SERVICES.map((service) => (
                    <td key={service} className="text-center">
                      {/* The Others tick carries what it was: on hover rather than in
                          the cell, so one row's free text cannot widen a column of
                          tick-boxes. */}
                      {given.has(service) ? (
                        service === "OTHERS" && row.othersDetail ? (
                          <span
                            title={row.othersDetail}
                            className="cursor-help border-b border-dotted border-ink-400"
                          >
                            ✓
                          </span>
                        ) : (
                          "✓"
                        )
                      ) : (
                        ""
                      )}
                    </td>
                  ))}
                  <td className="print:hidden">
                    <Link
                      href={`/regulation-licensing/${row.id}`}
                      className="font-medium text-primary hover:text-primary-600"
                    >
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
        <Pagination
          basePath="/regulation-licensing"
          page={page}
          totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          total={total}
          searchParams={query}
        />
      )}
    </main>
  );
}
