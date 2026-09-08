import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ASSISTANCE_FORMS,
  FORM_LABELS,
  SEX_LABELS,
  monthHeading,
  monthRange,
  officeTracksLegalAssistance,
} from "@/lib/legalAssistance";
import { scannedCopyFileName } from "@/lib/scannedCopy";
import { Pagination } from "@/components/Pagination";
import { PrintLink, listHref } from "@/components/PrintLink";
import { PrintToolbar } from "@/components/PrintToolbar";
import { PrintHeader } from "@/components/PrintHeader";
import { PlusIcon, SearchIcon } from "@/components/icons";
import { ClickableRow } from "@/components/ClickableRow";

const PAGE_SIZE = 20;
const PRINT_MAX = 2000;

type SearchParams = {
  q?: string;
  officer?: string;
  year?: string;
  month?: string;
  page?: string;
  print?: string;
};

export default async function LegalAssistancePage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  // Only offices whose lawyers keep this register have the module.
  if (!(await officeTracksLegalAssistance(officeId))) notFound();

  const q = searchParams.q?.trim() ?? "";
  const officer = searchParams.officer ?? "";
  const isPrint = searchParams.print === "1";
  const page = Math.max(1, Number(searchParams.page) || 1);

  // The sheet is kept a month at a time, under a single "August 2026" heading.
  // Blank means every month, which the sheet cannot do and a register reader
  // sometimes wants.
  const year = /^\d{4}$/.test(searchParams.year ?? "") ? parseInt(searchParams.year!, 10) : null;
  const month = /^(1[0-2]|[1-9])$/.test(searchParams.month ?? "")
    ? parseInt(searchParams.month!, 10)
    : null;
  const period = year && month ? monthRange(year, month) : null;

  const where: Prisma.LegalAssistanceWhereInput = {
    officeId,
    ...(officer ? { legalOfficerId: officer } : {}),
    ...(period ? { assistanceDate: period } : {}),
    ...(q
      ? {
          OR: [
            { clientName: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { legalOfficer: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } },
          ],
        }
      : {}),
  };

  const [rows, total, office, officers] = await Promise.all([
    prisma.legalAssistance.findMany({
      where,
      // Tie-broken by entry order: assistanceDate carries no time, so a day's
      // clients sort equal and would otherwise drift between requests — which
      // under skip/take also breaks pagination.
      orderBy: [{ assistanceDate: "desc" }, { createdAt: "desc" }],
      skip: isPrint ? 0 : (page - 1) * PAGE_SIZE,
      take: isPrint ? PRINT_MAX : PAGE_SIZE,
      include: { legalOfficer: { select: { name: true } } },
    }),
    prisma.legalAssistance.count({ where }),
    prisma.office.findUnique({ where: { id: officeId }, select: { name: true } }),
    prisma.user.findMany({
      where: { officeId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const query = {
    ...(q ? { q } : {}),
    ...(officer ? { officer } : {}),
    ...(year && month ? { year: String(year), month: String(month) } : {}),
  };

  return (
    <main className="space-y-4 p-6 lg:p-8">
      {isPrint ? (
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">
            Legal assistance <span className="text-ink-400 dark:text-white/30">· print preview</span>
          </h1>
          <PrintToolbar backHref={listHref("/legal-assistance", query)} />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Legal assistance</h1>
            <p className="font-mono text-xs uppercase tracking-wide text-ink-500 dark:text-white/40">
              {period ? monthHeading(year!, month!) : "All months"} · {total} client
              {total === 1 ? "" : "s"} assisted
            </p>
          </div>
          <div className="flex gap-2">
            <PrintLink basePath="/legal-assistance" searchParams={query} />
            <Link href="/legal-assistance/new" className="btn-primary">
              <PlusIcon className="h-4 w-4" />
              New
            </Link>
          </div>
        </div>
      )}

      {isPrint && (
        <PrintHeader
          officeName={office?.name ?? ""}
          title="Legal Assistance Register"
          filters={[
            { label: "Period", value: period ? monthHeading(year!, month!) : "All months" },
            {
              label: "Legal officer",
              value: officers.find((o) => o.id === officer)?.name ?? "All",
            },
            { label: "Search", value: q || "—" },
          ]}
          total={total}
          generatedBy={session!.user.name ?? "—"}
        />
      )}

      {!isPrint && (
        <form action="/legal-assistance" method="get" className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/30" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Client or legal officer"
              className="field-input w-64 pl-9"
            />
          </div>
          <select name="officer" defaultValue={officer} className="field-input w-auto">
            <option value="">All legal officers</option>
            {officers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
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
          <Link href="/legal-assistance" className="btn-secondary">
            Clear
          </Link>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            {/* Two header rows, as the sheet has them: M and F sit under one
                "Sex" span, and the eight tick columns under one heading, rather
                than reading as ten unrelated columns. */}
            <tr>
              <th rowSpan={2}>Date</th>
              <th rowSpan={2}>Legal officer</th>
              <th rowSpan={2}>Complainant / client</th>
              <th colSpan={2} className="text-center">
                Sex
              </th>
              <th colSpan={ASSISTANCE_FORMS.length} className="text-center">
                Form of legal assistance
              </th>
              <th rowSpan={2}>Scanned completed LAD</th>
              <th rowSpan={2} className="print:hidden"></th>
            </tr>
            <tr>
              <th className="text-center">M</th>
              <th className="text-center">F</th>
              {ASSISTANCE_FORMS.map((form) => (
                <th key={form} className="text-center">
                  {FORM_LABELS[form]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={ASSISTANCE_FORMS.length + 6} className="text-ink-500 dark:text-white/40">
                  No legal assistance recorded{period ? ` for ${monthHeading(year!, month!)}` : ""} yet.
                </td>
              </tr>
            )}

            {rows.map((row) => {
              const given = new Set(row.forms);
              return (
                <ClickableRow key={row.id} href={`/legal-assistance/${row.id}`}>
                  <td className="whitespace-nowrap">
                    {row.assistanceDate.toLocaleDateString("en-US", { timeZone: "UTC" })}
                  </td>
                  <td className="whitespace-nowrap">{row.legalOfficer.name}</td>
                  <td className="font-medium text-ink-900 dark:text-white">{row.clientName}</td>
                  {/* A tick or nothing, the way the sheet reads. A dash in every
                      empty box would turn a register that is mostly empty boxes
                      into a wall of punctuation. */}
                  <td className="text-center">{row.sex === "MALE" ? "✓" : ""}</td>
                  <td className="text-center">{row.sex === "FEMALE" ? "✓" : ""}</td>
                  {ASSISTANCE_FORMS.map((form) => (
                    <td key={form} className="text-center">
                      {/* The Others tick carries what it was: on hover rather than in
                          the cell, so one row's free text cannot widen a column of
                          tick-boxes. */}
                      {given.has(form) ? (
                        form === "OTHERS" && row.othersDetail ? (
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
                  <td>
                    {isPrint ? (
                      row.scannedCopyUrl ? (
                        "Yes"
                      ) : (
                        "—"
                      )
                    ) : row.scannedCopyUrl ? (
                      <a
                        href={`/api/files/${row.scannedCopyUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        title={scannedCopyFileName(row.scannedCopyUrl)}
                        className="block max-w-[14rem] truncate text-info hover:underline"
                      >
                        {scannedCopyFileName(row.scannedCopyUrl)}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="print:hidden">
                    <Link
                      href={`/legal-assistance/${row.id}`}
                      className="font-medium text-primary hover:text-primary-600"
                    >
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
        <Pagination
          basePath="/legal-assistance"
          page={page}
          totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          total={total}
          searchParams={query}
        />
      )}
    </main>
  );
}
