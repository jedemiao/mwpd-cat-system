import { getServerSession } from "next-auth";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getArtaAlertDocuments } from "@/lib/artaAlerts";
import { Pagination } from "@/components/Pagination";
import { Badge } from "@/components/Badge";
import { PrintLink, listHref } from "@/components/PrintLink";
import { PrintToolbar } from "@/components/PrintToolbar";
import { PrintHeader } from "@/components/PrintHeader";
import { PlusIcon, SearchIcon } from "@/components/icons";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPE_OTHER_CODE, documentTypeLabel } from "@/lib/documentTypeCodes";
import {
  PIPELINE_STAGE_LABELS,
  isPipelineStage,
  officeTracksSignOff,
  pipelineStageWhere,
  pipelineStagesFor,
  type PipelineStage,
} from "@/lib/correspondencePipeline";

// In the ledger's narrow type column, an "Others" row shows what was actually
// typed — a bare "O" would be the one code the legend cannot explain.
function documentTypeCell(code: string | null, other: string | null): string {
  if (code === DOCUMENT_TYPE_OTHER_CODE) return other || DOCUMENT_TYPE_OTHER_CODE;
  return code ?? "—";
}

const PAGE_SIZE = 20;

// Ceiling on a single printout. The print view drops pagination on purpose, so
// without a cap an unfiltered ledger would grow into an unbounded query and a
// print job nobody meant to send. PrintHeader says so on the page when it bites.
const PRINT_MAX = 2000;

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  overdue: "Overdue",
  completed: "Completed",
};

const ORIGIN_LABELS: Record<string, string> = { INTERNAL: "Internal", EXTERNAL: "External" };

type SearchParams = {
  q?: string;
  status?: string;
  stage?: string;
  origin?: string;
  type?: string;
  agency?: string;
  signatory?: string;
  page?: string;
  print?: string;
};

// Server component: fetches directly via Prisma (no client-side fetch needed
// for the initial render), scoped to the logged-in user's office.
export default async function IncomingPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  const q = searchParams.q?.trim() ?? "";
  const status = searchParams.status ?? "all";
  // Which handover the document is sitting at, from the dashboard's pipeline
  // board. Kept as its own parameter rather than folded into `status` because
  // the two are orthogonal — "overdue and unrouted" is the combination anyone
  // chasing a backlog actually wants, and one shared parameter could not say it.
  //
  // An unrecognised value falls back to no filter rather than an empty ledger,
  // matching how `status` treats anything outside its three known values —
  // and "unrecognised" is judged against the stages this office actually has,
  // not the global list. A hand-typed ?stage=signed-off at an office with no
  // sign-off step is a name that means nothing here, so it should give the
  // whole ledger rather than a heading over permanently empty results.
  const tracksSignOff = await officeTracksSignOff(officeId);
  const officeStages = pipelineStagesFor(tracksSignOff);
  const stageParam = searchParams.stage ?? "";
  const stage: PipelineStage | "" =
    isPipelineStage(stageParam) && officeStages.includes(stageParam) ? stageParam : "";
  const origin = searchParams.origin ?? "";
  const docType = searchParams.type ?? "";
  const agency = searchParams.agency ?? "";
  const signatory = searchParams.signatory ?? "";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const isPrint = searchParams.print === "1";
  const today = new Date();

  const statusWhere: Prisma.IncomingDocumentWhereInput =
    status === "overdue"
      ? { dateCompleted: null, dueDate: { lt: today } }
      : status === "pending"
        ? { dateCompleted: null, OR: [{ dueDate: null }, { dueDate: { gte: today } }] }
        : status === "completed"
          ? { dateCompleted: { not: null } }
          : {};

  // Built by the shared function rather than restated here, so the row count
  // behind a pipeline link can never disagree with the number that was clicked
  // — including the sign-off variation, which changes what `unrouted` and
  // `routed` mean, not just whether a fourth tile appears.
  const stageWhere: Prisma.IncomingDocumentWhereInput = stage
    ? pipelineStageWhere(stage, tracksSignOff)
    : {};

  // Status and stage go inside AND rather than being spread alongside the rest.
  // Both can set `dateCompleted`, and the free-text search below sets `OR` —
  // spreading them into one object let whichever came last silently win, so
  // "pending" plus a search term quietly widened to every open document,
  // overdue ones included. AND keeps each condition whole.
  const where: Prisma.IncomingDocumentWhereInput = {
    officeId,
    AND: [statusWhere, stageWhere],
    ...(origin === "INTERNAL" || origin === "EXTERNAL" ? { origin } : {}),
    ...(docType ? { documentType: docType } : {}),
    ...(agency ? { originAgency: agency } : {}),
    ...(signatory ? { signatory } : {}),
    // Free-text search now also reaches the sender and the signatory, which is
    // how a clerk actually looks for "that letter from Ortigas".
    ...(q
      ? {
          OR: [
            { documentTitle: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { routingNumber: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { originAgency: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { signatory: { contains: q, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {}),
  };

  const [docs, total, { overdueDocs, dueSoonDocs }, office, agencyRows, signatoryRows, typeRows] = await Promise.all([
    prisma.incomingDocument.findMany({
      where,
      orderBy: { dateReceived: "desc" },
      include: {
        routedTo: { include: { user: { select: { name: true } } } },
        // The ledger names the desk officer who accepted the document, as the
        // office's own internal register does.
        receivedBy: { select: { name: true } },
      },
      // The print view shows the whole filtered ledger, not one screen of it.
      skip: isPrint ? undefined : (page - 1) * PAGE_SIZE,
      take: isPrint ? PRINT_MAX : PAGE_SIZE,
    }),
    prisma.incomingDocument.count({ where }),
    getArtaAlertDocuments(officeId),
    // name is only needed for the printed letterhead, but tracksArta decides
    // whether the Due date column renders at all, so this now runs every load.
    prisma.office.findUnique({
      where: { id: officeId },
      select: { name: true, tracksArta: true, detailedLedgerColumns: true, incomingRegisterForm: true },
    }),
    // Filter options derived from what's actually been logged, office-wide —
    // deliberately not narrowed by the current filter, or choosing one value
    // would empty the other dropdowns.
    prisma.incomingDocument.findMany({
      where: { officeId, originAgency: { not: null } },
      distinct: ["originAgency"],
      select: { originAgency: true },
      orderBy: { originAgency: "asc" },
    }),
    prisma.incomingDocument.findMany({
      where: { officeId, signatory: { not: null } },
      distinct: ["signatory"],
      select: { signatory: true },
      orderBy: { signatory: "asc" },
    }),
    prisma.incomingDocument.findMany({
      where: { officeId, documentType: { not: null } },
      distinct: ["documentType"],
      select: { documentType: true },
      orderBy: { documentType: "asc" },
    }),
  ]);

  const agencies = agencyRows.map((r) => r.originAgency!).filter(Boolean);
  const signatories = signatoryRows.map((r) => r.signatory!).filter(Boolean);
  const docTypes = typeRows.map((r) => r.documentType!).filter(Boolean);

  const activeFilters = {
    q,
    status: status !== "all" ? status : undefined,
    stage: stage || undefined,
    origin: origin || undefined,
    type: docType || undefined,
    agency: agency || undefined,
    signatory: signatory || undefined,
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const backHref = listHref("/incoming", activeFilters);

  // The office keeps internal and external as two separate ledgers, and the
  // nav links straight into each. Naming the ledger in the heading is what
  // stops a filtered list from looking identical to the full one — without it
  // the only difference on screen is which rows happen to be missing.
  //
  // Arriving from the dashboard's pipeline board, the stage names the list too:
  // the board's promise is "these N documents", and a heading that still said
  // "Incoming documents" would leave the reader checking the count by hand.
  const ledgerLabel = ORIGIN_LABELS[origin] ?? "";
  const stageLabel = stage ? PIPELINE_STAGE_LABELS[stage] : "";
  const heading = [ledgerLabel ? `Incoming · ${ledgerLabel}` : "Incoming documents", stageLabel]
    .filter(Boolean)
    .join(" · ");
  const tracksArta = office?.tracksArta ?? false;
  const detailedColumns = office?.detailedLedgerColumns ?? false;
  // This office reads its ledger as its register: only the columns that sheet
  // has (Office.incomingRegisterForm). Source and Doc Type are not among them.
  const registerLayout = office?.incomingRegisterForm ?? false;
  // Source: the register's form never asks for one, so every row would read the
  // same value. A column and a filter that can only ever say "External" are
  // worse than absent — they invite someone to go looking for a distinction
  // this office does not draw.
  const tracksOrigin = !registerLayout;

  return (
    <main className="space-y-4 p-6 lg:p-8">
      {isPrint ? (
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">
            {heading} <span className="text-ink-400 dark:text-white/30">· print preview</span>
          </h1>
          <PrintToolbar backHref={backHref} />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">{heading}</h1>
          <div className="flex gap-2">
            <PrintLink basePath="/incoming" searchParams={activeFilters} />
            <Link href={origin ? `/incoming/new?origin=${origin}` : "/incoming/new"} className="btn-primary">
              <PlusIcon className="h-4 w-4" />
              New
            </Link>
          </div>
        </div>
      )}

      {isPrint && (
        <PrintHeader
          officeName={office?.name ?? ""}
          title="Incoming documents"
          filters={[
            { label: "Search", value: q },
            { label: "Status", value: STATUS_LABELS[status] ?? "" },
            { label: "Stage", value: stageLabel },
            { label: "Source", value: ORIGIN_LABELS[origin] ?? "" },
            { label: "Type", value: docType },
            { label: "Agency", value: agency },
            { label: "Signatory", value: signatory },
          ]}
          total={total}
          generatedBy={session!.user.name ?? "—"}
          truncatedAt={PRINT_MAX}
        />
      )}

      {/* The ARTA banner is a screen alert, not ledger content — the Status
          column already carries "Overdue" onto the paper. */}
      {!isPrint && (overdueDocs.length > 0 || dueSoonDocs.length > 0) && (
        <div className="space-y-2">
          {overdueDocs.length > 0 && (
            <div className="rounded-md border border-danger/25 bg-danger-50 px-4 py-3 text-sm text-ink-700 dark:border-danger/20 dark:bg-danger/10 dark:text-white/70">
              <strong className="text-danger-600 dark:text-danger">{overdueDocs.length} overdue</strong> — past their ARTA due date:{" "}
              {overdueDocs.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ", "}
                  <Link href={`/incoming/${d.id}`} className="font-medium text-ink-900 underline decoration-danger/40 dark:text-white">
                    {d.routingNumber}
                  </Link>
                </span>
              ))}
            </div>
          )}
          {dueSoonDocs.length > 0 && (
            <div className="rounded-md border border-warning/30 bg-warning-50 px-4 py-3 text-sm text-ink-700 dark:border-warning/20 dark:bg-warning/10 dark:text-white/70">
              <strong className="text-[#92660c] dark:text-warning">{dueSoonDocs.length} due within 2 days</strong>:{" "}
              {dueSoonDocs.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ", "}
                  <Link href={`/incoming/${d.id}`} className="font-medium text-ink-900 underline decoration-warning/50 dark:text-white">
                    {d.routingNumber}
                  </Link>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {!isPrint && (
        <form action="/incoming" method="get" className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/30" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Number, subject, agency, signatory…"
              className="field-input pl-9"
            />
          </div>
          {tracksOrigin && (
            <select name="origin" defaultValue={origin} className="field-input w-auto">
              <option value="">All sources</option>
              <option value="INTERNAL">Internal</option>
              <option value="EXTERNAL">External</option>
            </select>
          )}
          <select name="type" defaultValue={docType} className="field-input w-auto">
            <option value="">All types</option>
            {docTypes.map((t) => (
              <option key={t} value={t}>
                {t} — {DOCUMENT_TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
          <select name="agency" defaultValue={agency} className="field-input w-auto max-w-48">
            <option value="">All agencies</option>
            {agencies.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select name="signatory" defaultValue={signatory} className="field-input w-auto max-w-48">
            <option value="">All signatories</option>
            {signatories.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={status} className="field-input w-auto">
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="overdue">Overdue</option>
            <option value="completed">Completed</option>
          </select>
          {/* Present as a control, not just an honoured URL parameter: without
              it, hitting Search after arriving from the pipeline board would
              silently drop the stage and hand back the whole ledger. */}
          <select name="stage" defaultValue={stage} className="field-input w-auto">
            <option value="">All stages</option>
            {officeStages.map((s) => (
              <option key={s} value={s}>
                {PIPELINE_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-dark">
            Search
          </button>
          <Link href="/incoming" className="btn-secondary">
            Clear
          </Link>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            {/* Two layouts. The register layout follows MWPSD's own internal
                register (mwpsd_tracker/…view_incoming_internal.php.png) column
                for column, because their clerks read it by position; every
                other office keeps the compact ledger, which fits a printed
                sheet where fifteen columns do not.

                Departures from the reference, both deliberate: Source appears
                only in the combined view (inside a ledger every row repeats the
                same value), and Routed to / Due date / Status are ours with no
                reference counterpart — dropping them would regress Division
                Chief routing and ARTA, which the adoption plan forbids. */}
            {detailedColumns ? (
              <tr>
                <th>Date</th>
                <th>Received By</th>
                <th>Time</th>
                <th>Control No.</th>
                <th>Doc Type</th>
                {tracksOrigin && !origin && <th>Source</th>}
                <th>Office/Agency</th>
                <th>Signatories</th>
                <th>Particulars</th>
                <th>Remarks</th>
                <th>Notes</th>
                <th>Routed to</th>
                {tracksArta && <th>Due date</th>}
                <th>Status</th>
                <th>Scanned copy</th>
                <th className="print:hidden"></th>
              </tr>
            ) : (
              <tr>
                <th>Date received</th>
                <th>Routing number</th>
                {tracksOrigin && !origin && <th>Source</th>}
                {/* Not a column on the register. The type is still recorded and
                    still filterable — it is the middle segment of the routing
                    number beside it (081226-L-020), so a column repeating it
                    spent width on something already on the row. */}
                {!registerLayout && <th>Type</th>}
                {/* "Particulars" is MWPSD's word for this column and stays in
                    their register above; everywhere else the heading matches
                    the form's own label, as the outgoing ledger already does. */}
                <th>Document title / subject</th>
                <th>Routed to</th>
                {tracksArta && <th>Due date</th>}
                <th>Status</th>
                <th>Scanned copy</th>
                <th className="print:hidden"></th>
              </tr>
            )}
          </thead>
          <tbody>
            {docs.map((doc) => {
              const overdue = doc.dueDate && !doc.dateCompleted && doc.dueDate < today;
              return (
                <tr key={doc.id}>
                  {detailedColumns ? (
                    <>
                      <td className="whitespace-nowrap">{doc.dateReceived.toLocaleDateString()}</td>
                      <td className="whitespace-nowrap">{doc.receivedBy?.name ?? "—"}</td>
                      <td className="whitespace-nowrap text-xs">{doc.timeReceived ?? "—"}</td>
                      <td className="whitespace-nowrap font-mono text-xs">{doc.routingNumber}</td>
                      <td className="whitespace-nowrap text-xs" title={documentTypeLabel(doc.documentType, doc.documentTypeOther)}>
                        {documentTypeCell(doc.documentType, doc.documentTypeOther)}
                      </td>
                      {tracksOrigin && !origin && <td className="whitespace-nowrap text-xs">{ORIGIN_LABELS[doc.origin]}</td>}
                      <td>{doc.originAgency ?? "—"}</td>
                      <td>{doc.signatory ?? "—"}</td>
                      <td>{doc.documentTitle}</td>
                      <td>{doc.progressRemarks ?? "—"}</td>
                      <td>{doc.notes ?? "—"}</td>
                    </>
                  ) : (
                    <>
                      <td className="whitespace-nowrap">
                        {doc.dateReceived.toLocaleDateString()}
                        {doc.timeReceived && (
                          <span className="ml-1 text-xs text-ink-400 dark:text-white/30">{doc.timeReceived}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap font-mono text-xs">{doc.routingNumber}</td>
                      {tracksOrigin && !origin && <td className="whitespace-nowrap text-xs">{ORIGIN_LABELS[doc.origin]}</td>}
                      {!registerLayout && (
                        <td className="whitespace-nowrap text-xs" title={documentTypeLabel(doc.documentType, doc.documentTypeOther)}>
                          {documentTypeCell(doc.documentType, doc.documentTypeOther)}
                        </td>
                      )}
                      <td>
                        {doc.documentTitle}
                        {/* The register has no Office/Agency column either, and
                            its form never collects one, so this sub-line has
                            nothing to show there. */}
                        {doc.originAgency && (
                          <span className="block text-xs text-ink-400 dark:text-white/30">{doc.originAgency}</span>
                        )}
                      </td>
                    </>
                  )}
                  <td className="whitespace-nowrap">
                    {doc.routedTo.length > 0 ? doc.routedTo.map((r) => r.user.name).join(", ") : "—"}
                  </td>
                  {tracksArta && (
                    <td className="whitespace-nowrap">{doc.dueDate?.toLocaleDateString() ?? "—"}</td>
                  )}
                  <td className="whitespace-nowrap">
                    {doc.dateCompleted ? (
                      <Badge variant="success">Completed</Badge>
                    ) : overdue ? (
                      <Badge variant="danger">Overdue</Badge>
                    ) : (
                      <Badge variant="warning">Pending</Badge>
                    )}
                  </td>
                  {/* On paper a "View" link is a dead end — what the clerk
                      needs to know is simply whether a scan exists. */}
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
                    <Link href={`/incoming/${doc.id}`} className="font-medium text-primary hover:text-primary-600">
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
        <Pagination basePath="/incoming" page={page} totalPages={totalPages} total={total} searchParams={activeFilters} />
      )}
    </main>
  );
}
