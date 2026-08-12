import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PrintLink, listHref } from "@/components/PrintLink";
import { PrintToolbar } from "@/components/PrintToolbar";
import { PrintHeader } from "@/components/PrintHeader";
import { PlusIcon } from "@/components/icons";
import {
  currentSemester,
  formatBudget,
  isSemester,
  monthAbbrev,
  officeTracksDipcr,
  semesterLabel,
  semesterMonths,
  type DipcrSemesterValue,
} from "@/lib/dipcr";

type SearchParams = { year?: string; semester?: string; print?: string };

export default async function DipcrPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  if (!(await officeTracksDipcr(officeId))) notFound();

  const now = currentSemester();
  const year = /^\d{4}$/.test(searchParams.year ?? "") ? parseInt(searchParams.year!, 10) : now.year;
  const semester: DipcrSemesterValue = isSemester(searchParams.semester ?? "")
    ? (searchParams.semester as DipcrSemesterValue)
    : now.semester;
  const isPrint = searchParams.print === "1";
  const months = semesterMonths(semester);

  const [indicators, office] = await Promise.all([
    prisma.dipcrIndicator.findMany({
      where: { officeId, year, semester },
      // Section, then PAP, then the sheet's own order within a PAP.
      orderBy: [{ section: "asc" }, { pap: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        accountable: { include: { user: { select: { id: true, name: true } } } },
        accomplishments: true,
      },
    }),
    prisma.office.findUnique({ where: { id: officeId }, select: { name: true } }),
  ]);

  // Grouped the way the sheet's merged cells read: section, then PAP. Built
  // here rather than in the markup so the row spans below are just counts.
  const sections: { section: string; paps: { pap: string; rows: typeof indicators }[] }[] = [];
  for (const ind of indicators) {
    let section = sections.find((s) => s.section === ind.section);
    if (!section) {
      section = { section: ind.section, paps: [] };
      sections.push(section);
    }
    let pap = section.paps.find((p) => p.pap === ind.pap);
    if (!pap) {
      pap = { pap: ind.pap, rows: [] };
      section.paps.push(pap);
    }
    pap.rows.push(ind);
  }

  const query = { year: String(year), semester };
  const backHref = listHref("/dipcr", query);

  return (
    <main className="space-y-4 p-6 lg:p-8">
      {isPrint ? (
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">
            D/IPCR <span className="text-ink-400 dark:text-white/30">· print preview</span>
          </h1>
          <PrintToolbar backHref={backHref} />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink-900 dark:text-white">D/IPCR</h1>
            <p className="font-mono text-xs uppercase tracking-wide text-ink-500 dark:text-white/40">
              Performance commitment · {semesterLabel(semester)} {year}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintLink basePath="/dipcr" searchParams={query} />
            <Link href={`/dipcr/new?year=${year}&semester=${semester}`} className="btn-primary">
              <PlusIcon className="h-4 w-4" />
              New indicator
            </Link>
          </div>
        </div>
      )}

      {isPrint && (
        <PrintHeader
          officeName={office?.name ?? ""}
          title="Division / Individual Performance Commitment and Review"
          filters={[
            { label: "Year", value: String(year) },
            { label: "Semester", value: semesterLabel(semester) },
          ]}
          total={indicators.length}
          generatedBy={session!.user.name ?? "—"}
        />
      )}

      {!isPrint && (
        <form action="/dipcr" method="get" className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            name="year"
            defaultValue={year}
            min={2000}
            max={2100}
            className="field-input w-28"
            aria-label="Year"
          />
          <select name="semester" defaultValue={semester} className="field-input w-auto">
            <option value="FIRST">1st semester (Jan–Jun)</option>
            <option value="SECOND">2nd semester (Jul–Dec)</option>
          </select>
          <button type="submit" className="btn-dark">
            Show
          </button>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            {/* Two header rows, as the sheet has them: the month columns sit
                under one "Actual Accomplishments" span rather than reading as
                six unrelated columns. */}
            <tr>
              <th rowSpan={2}>Organizational Outcome / PAP</th>
              <th rowSpan={2}>Success indicators (targets + measures)</th>
              <th rowSpan={2}>Allotted budget</th>
              <th rowSpan={2}>Division / individuals accountable</th>
              <th colSpan={months.length} className="text-center">
                Actual accomplishments
              </th>
              <th rowSpan={2}>Remarks</th>
              <th rowSpan={2} className="print:hidden"></th>
            </tr>
            <tr>
              {months.map((m) => (
                <th key={m}>{monthAbbrev(m)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indicators.length === 0 && (
              <tr>
                <td colSpan={months.length + 6} className="text-ink-500 dark:text-white/40">
                  Nothing recorded for {semesterLabel(semester)} {year} yet.
                </td>
              </tr>
            )}

            {sections.map((section) => {
              // The section name ("CORE FUNCTIONS") is printed once, above the
              // first PAP under it, rather than repeated down every group.
              let sectionCellDone = false;

              return section.paps.map((pap) =>
                pap.rows.map((ind, rowIndex) => {
                  const byMonth = new Map(ind.accomplishments.map((a) => [a.month, a.narrative]));
                  const showSection = !sectionCellDone;
                  if (showSection) sectionCellDone = true;

                  return (
                    <tr key={ind.id}>
                      {/* The PAP name is written once per group and spans its
                          rows, which is what column A does on the sheet. The
                          section heading rides above it in the same cell. */}
                      {rowIndex === 0 && (
                        <td rowSpan={pap.rows.length} className="align-top">
                          {showSection && (
                            <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-ink-500 dark:text-white/40">
                              {section.section}
                            </span>
                          )}
                          <span className="font-medium text-ink-900 dark:text-white">{pap.pap}</span>
                        </td>
                      )}
                      <td className="min-w-56 align-top">{ind.successIndicator}</td>
                      <td className="whitespace-nowrap text-right align-top font-mono text-xs">
                        {formatBudget(ind.allottedBudget?.toString()) || "—"}
                      </td>
                      <td className="min-w-40 align-top text-xs">
                        {ind.accountable.length > 0
                          ? ind.accountable.map((a) => a.user.name).join(", ")
                          : "—"}
                      </td>
                      {months.map((m) => (
                        <td key={m} className="min-w-40 align-top text-xs">
                          {byMonth.get(m) ?? "—"}
                        </td>
                      ))}
                      <td className="align-top text-xs">{ind.remarks ?? "—"}</td>
                      <td className="align-top print:hidden">
                        <Link
                          href={`/dipcr/${ind.id}`}
                          className="font-medium text-primary hover:text-primary-600"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  );
                }),
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
