import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PrintLink, listHref } from "@/components/PrintLink";
import { PrintToolbar } from "@/components/PrintToolbar";
import { PrintHeader } from "@/components/PrintHeader";
import { PlusIcon } from "@/components/icons";
import { currentSemester, isSemester, semesterLabel, type DipcrSemesterValue } from "@/lib/dipcr";
import { ClickableRow } from "@/components/ClickableRow";
import {
  DIMENSION_LABELS,
  RATING_DIMENSIONS,
  RATING_LEVELS,
  descriptorFor,
  levelHeading,
  officeTracksIpcrRatingGuide,
} from "@/lib/ipcrRatingGuide";

type SearchParams = { year?: string; semester?: string; print?: string };

export default async function IpcrRatingGuidePage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  if (!(await officeTracksIpcrRatingGuide(officeId))) notFound();

  const now = currentSemester();
  const year = /^\d{4}$/.test(searchParams.year ?? "") ? parseInt(searchParams.year!, 10) : now.year;
  const semester: DipcrSemesterValue = isSemester(searchParams.semester ?? "")
    ? (searchParams.semester as DipcrSemesterValue)
    : now.semester;
  const isPrint = searchParams.print === "1";

  const [rows, office] = await Promise.all([
    prisma.ipcrRatingGuideRow.findMany({
      where: { officeId, year, semester },
      // Section, then PAP, then the sheet's own order within a PAP.
      orderBy: [{ section: "asc" }, { pap: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        accountable: { include: { user: { select: { id: true, name: true } } } },
        ratings: true,
      },
    }),
    prisma.office.findUnique({ where: { id: officeId }, select: { name: true } }),
  ]);

  // Each indicator occupies one table row per dimension it is rated on. An
  // indicator with no scale written yet still gets a single row — otherwise it
  // would vanish from the sheet the moment it was added, with no way back to
  // its own Edit link.
  const withRatings = rows.map((row) => {
    const ordered = RATING_DIMENSIONS.map((d) => row.ratings.find((r) => r.dimension === d)).filter(
      (r) => r !== undefined,
    );
    return { row, ratingRows: ordered.length > 0 ? ordered : [null] };
  });

  // Grouped the way the sheet's merged cells read: section, then PAP. Built
  // here rather than in the markup so the row spans below are just counts.
  const sections: {
    section: string;
    paps: { pap: string; indicators: typeof withRatings }[];
  }[] = [];
  for (const entry of withRatings) {
    let section = sections.find((s) => s.section === entry.row.section);
    if (!section) {
      section = { section: entry.row.section, paps: [] };
      sections.push(section);
    }
    let pap = section.paps.find((p) => p.pap === entry.row.pap);
    if (!pap) {
      pap = { pap: entry.row.pap, indicators: [] };
      section.paps.push(pap);
    }
    pap.indicators.push(entry);
  }

  const query = { year: String(year), semester };
  const backHref = listHref("/ipcr-rating-guide", query);
  // Four fixed columns + the Rating label + five levels + the edit column.
  const columnCount = 4 + 1 + RATING_LEVELS.length + 1;

  return (
    <main className="space-y-4 p-6 lg:p-8">
      {isPrint ? (
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">
            IPCR Rating Guide <span className="text-ink-400 dark:text-white/30">· print preview</span>
          </h1>
          <PrintToolbar backHref={backHref} />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink-900 dark:text-white">IPCR Rating Guide</h1>
            <p className="font-mono text-xs uppercase tracking-wide text-ink-500 dark:text-white/40">
              Agreed rating scale · {semesterLabel(semester)} {year}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintLink basePath="/ipcr-rating-guide" searchParams={query} />
            <Link
              href={`/ipcr-rating-guide/new?year=${year}&semester=${semester}`}
              className="btn-primary"
            >
              <PlusIcon className="h-4 w-4" />
              New indicator
            </Link>
          </div>
        </div>
      )}

      {isPrint && (
        <PrintHeader
          officeName={office?.name ?? ""}
          title="Individual Performance Commitment and Review — Rating Guide"
          filters={[
            { label: "Year", value: String(year) },
            { label: "Semester", value: semesterLabel(semester) },
          ]}
          total={rows.length}
          generatedBy={session!.user.name ?? "—"}
        />
      )}

      {!isPrint && (
        <form action="/ipcr-rating-guide" method="get" className="flex flex-wrap items-center gap-2">
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
            {/* Two header rows, as the sheet has them: the five score columns
                sit under one "Rating guide" span rather than reading as five
                unrelated columns. */}
            <tr>
              <th rowSpan={2}>Organizational Outcome / PAP</th>
              <th rowSpan={2}>Success indicators (targets + measures)</th>
              <th rowSpan={2}>Division / individuals accountable</th>
              <th rowSpan={2}>Means of verification</th>
              <th colSpan={RATING_LEVELS.length + 1} className="text-center">
                Rating guide
              </th>
              <th rowSpan={2} className="print:hidden"></th>
            </tr>
            <tr>
              <th>Rating</th>
              {RATING_LEVELS.map((level) => (
                <th key={level}>{levelHeading(level)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="text-ink-500 dark:text-white/40">
                  No rating guide agreed for {semesterLabel(semester)} {year} yet.
                </td>
              </tr>
            )}

            {sections.map((section) => {
              // The section name ("CORE FUNCTIONS") is printed once, above the
              // first PAP under it, rather than repeated down every group.
              let sectionCellDone = false;

              return section.paps.map((pap) => {
                // The PAP cell spans every dimension row of every indicator
                // beneath it, which is what column A does on the sheet.
                const papRowCount = pap.indicators.reduce((n, e) => n + e.ratingRows.length, 0);
                const showSection = !sectionCellDone;
                if (showSection) sectionCellDone = true;
                let papCellDone = false;

                return pap.indicators.map(({ row, ratingRows }) =>
                  ratingRows.map((rating, dimIndex) => {
                    const firstOfIndicator = dimIndex === 0;
                    const writePapCell = !papCellDone;
                    if (writePapCell) papCellDone = true;

                    return (
                      <ClickableRow
                        key={`${row.id}-${rating?.dimension ?? "none"}`}
                        href={`/ipcr-rating-guide/${row.id}`}
                      >
                        {writePapCell && (
                          <td rowSpan={papRowCount} className="align-top">
                            {showSection && (
                              <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-ink-500 dark:text-white/40">
                                {section.section}
                              </span>
                            )}
                            <span className="font-medium text-ink-900 dark:text-white">{pap.pap}</span>
                          </td>
                        )}

                        {/* Columns B–D belong to the indicator, not to one of
                            its dimensions, so they span its rows. */}
                        {firstOfIndicator && (
                          <>
                            <td rowSpan={ratingRows.length} className="min-w-56 align-top">
                              {row.successIndicator}
                            </td>
                            <td rowSpan={ratingRows.length} className="min-w-40 align-top text-xs">
                              {row.accountable.length > 0
                                ? row.accountable.map((a) => a.user.name).join(", ")
                                : "—"}
                            </td>
                            <td rowSpan={ratingRows.length} className="min-w-40 align-top text-xs">
                              {row.meansOfVerification || "—"}
                            </td>
                          </>
                        )}

                        <td className="whitespace-nowrap align-top text-xs font-semibold text-ink-900 dark:text-white">
                          {rating ? DIMENSION_LABELS[rating.dimension] : "—"}
                        </td>
                        {RATING_LEVELS.map((level) => (
                          <td key={level} className="min-w-44 align-top text-xs">
                            {(rating && descriptorFor(rating, level)) || "—"}
                          </td>
                        ))}

                        {firstOfIndicator && (
                          <td rowSpan={ratingRows.length} className="align-top print:hidden">
                            <Link
                              href={`/ipcr-rating-guide/${row.id}`}
                              className="font-medium text-primary hover:text-primary-600"
                            >
                              Edit
                            </Link>
                          </td>
                        )}
                      </ClickableRow>
                    );
                  }),
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
