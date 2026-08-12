import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/Badge";
import { PrintLink, listHref } from "@/components/PrintLink";
import { PrintToolbar } from "@/components/PrintToolbar";
import { PrintHeader } from "@/components/PrintHeader";
import {
  defaultPeriodMonth,
  formatMonthLabel,
  formatMonthParam,
  officeTracksDtr,
  parseMonthParam,
} from "@/lib/dtr";

type SearchParams = { month?: string; print?: string };

// No pagination here, deliberately. The page is one month of one office's
// roster — a dozen rows — and it is a checklist, so splitting it across pages
// would hide exactly the people it exists to surface.
export default async function DtrPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  if (!(await officeTracksDtr(officeId))) notFound();

  // Defaults to last month, which is the one being filed — see defaultPeriodMonth.
  const period = parseMonthParam(searchParams.month) ?? defaultPeriodMonth();
  const monthParam = formatMonthParam(period);
  const isPrint = searchParams.print === "1";

  const [records, roster, office] = await Promise.all([
    prisma.dtrRecord.findMany({
      where: { officeId, periodMonth: period },
      include: { personnel: { select: { id: true, name: true } } },
    }),
    // Active staff only: someone who has left has no DTR to file, and listing
    // them would leave a row nobody can ever clear.
    prisma.user.findMany({
      where: { officeId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.office.findUnique({ where: { id: officeId }, select: { name: true } }),
  ]);

  const byPersonnel = new Map(records.map((r) => [r.personnelId, r]));

  // The roster drives the rows, not the records — that is the whole point of
  // this view. Everyone on staff appears; whether they have filed is a lookup.
  const rows = roster.map((person) => ({ person, record: byPersonnel.get(person.id) ?? null }));
  const filedCount = rows.filter((r) => r.record).length;
  const checkedCount = rows.filter((r) => r.record?.submittedAndChecked).length;

  // Stated once above the table rather than repeated down a column, which is
  // what the source sheet's merged cell was doing.
  const received = records.find((r) => r.dateReceived)?.dateReceived ?? null;

  const backHref = listHref("/dtr", { month: monthParam });

  return (
    <main className="space-y-4 p-6 lg:p-8">
      {isPrint ? (
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">
            DTR filing <span className="text-ink-400 dark:text-white/30">· print preview</span>
          </h1>
          <PrintToolbar backHref={backHref} />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink-900 dark:text-white">DTR filing</h1>
            <p className="font-mono text-xs uppercase tracking-wide text-ink-500 dark:text-white/40">
              For the month of {formatMonthLabel(period)}
              {received && ` · received ${received.toLocaleDateString()}`}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintLink basePath="/dtr" searchParams={{ month: monthParam }} />
            <Link href={`/dtr/new?month=${monthParam}`} className="btn-primary">
              Record filing
            </Link>
          </div>
        </div>
      )}

      {isPrint && (
        <PrintHeader
          officeName={office?.name ?? ""}
          title="DTR filing"
          filters={[
            { label: "Month", value: formatMonthLabel(period) },
            { label: "Date received", value: received ? received.toLocaleDateString() : "" },
          ]}
          total={filedCount}
          generatedBy={session!.user.name ?? "—"}
        />
      )}

      {!isPrint && (
        <form action="/dtr" method="get" className="flex flex-wrap items-center gap-2">
          <label className="field-label mb-0" htmlFor="month">
            Month
          </label>
          <input id="month" type="month" name="month" defaultValue={monthParam} className="field-input w-auto" />
          <button type="submit" className="btn-dark">
            Show
          </button>
          {/* The count that matters is how many are still outstanding, so it is
              stated as a sentence rather than left to be worked out by eye. */}
          <p className="ml-auto text-sm text-ink-500 dark:text-white/40">
            {filedCount} of {rows.length} filed
            {filedCount > 0 && ` · ${checkedCount} submitted and checked`}
          </p>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Date filed</th>
              <th>Date submitted to HR</th>
              <th>Submitted and checked</th>
              <th className="print:hidden"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ person, record }) => (
              <tr key={person.id} className={record ? undefined : "bg-surface/60 dark:bg-white/[0.02]"}>
                <td className="whitespace-nowrap font-medium text-ink-900 dark:text-white">{person.name}</td>
                <td className="whitespace-nowrap">{record?.dateFiled?.toLocaleDateString() ?? "—"}</td>
                <td className="whitespace-nowrap">{record?.dateSubmittedToHr?.toLocaleDateString() ?? "—"}</td>
                <td className="whitespace-nowrap">
                  {!record ? (
                    <Badge variant="danger">Not filed</Badge>
                  ) : record.submittedAndChecked ? (
                    <Badge variant="success">Yes</Badge>
                  ) : (
                    <Badge variant="warning">Not yet</Badge>
                  )}
                </td>
                <td className="print:hidden">
                  {record ? (
                    <Link href={`/dtr/${record.id}`} className="font-medium text-primary hover:text-primary-600">
                      Edit
                    </Link>
                  ) : (
                    <Link
                      href={`/dtr/new?month=${monthParam}&personnelId=${person.id}`}
                      className="font-medium text-primary hover:text-primary-600"
                    >
                      Record
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-ink-500 dark:text-white/40">
                  No active staff on the roster.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
