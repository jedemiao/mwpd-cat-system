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
import { DOCUMENT_TYPE_LABELS } from "@/lib/documentTypeCodes";

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

  const where: Prisma.IncomingDocumentWhereInput = {
    officeId,
    ...statusWhere,
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
      include: { routedTo: { include: { user: { select: { name: true } } } } },
      // The print view shows the whole filtered ledger, not one screen of it.
      skip: isPrint ? undefined : (page - 1) * PAGE_SIZE,
      take: isPrint ? PRINT_MAX : PAGE_SIZE,
    }),
    prisma.incomingDocument.count({ where }),
    getArtaAlertDocuments(officeId),
    // Only needed for the printed letterhead — skip the query on normal loads.
    isPrint ? prisma.office.findUnique({ where: { id: officeId }, select: { name: true } }) : Promise.resolve(null),
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
    origin: origin || undefined,
    type: docType || undefined,
    agency: agency || undefined,
    signatory: signatory || undefined,
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const backHref = listHref("/incoming", activeFilters);

  return (
    <main className="space-y-4 p-6 lg:p-8">
      {isPrint ? (
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">
            Incoming documents <span className="text-ink-400 dark:text-white/30">· print preview</span>
          </h1>
          <PrintToolbar backHref={backHref} />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Incoming documents</h1>
          <div className="flex gap-2">
            <PrintLink basePath="/incoming" searchParams={activeFilters} />
            <Link href="/incoming/new" className="btn-primary">
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
          <select name="origin" defaultValue={origin} className="field-input w-auto">
            <option value="">All sources</option>
            <option value="INTERNAL">Internal</option>
            <option value="EXTERNAL">External</option>
          </select>
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
            <tr>
              <th>Date received</th>
              <th>Routing number</th>
              {/* Source and Type earn a column; agency, signatory, received-by
                  and notes are on the record and in the filters instead — a
                  ledger that runs past ten columns stops being readable on
                  screen and stops fitting a printed sheet. */}
              <th>Source</th>
              <th>Type</th>
              <th>Particulars</th>
              <th>Routed to</th>
              <th>Due date</th>
              <th>Status</th>
              <th>Scanned copy</th>
              <th className="print:hidden"></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => {
              const overdue = doc.dueDate && !doc.dateCompleted && doc.dueDate < today;
              return (
                <tr key={doc.id}>
                  <td className="whitespace-nowrap">
                    {doc.dateReceived.toLocaleDateString()}
                    {doc.timeReceived && (
                      <span className="ml-1 text-xs text-ink-400 dark:text-white/30">{doc.timeReceived}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap font-mono text-xs">{doc.routingNumber}</td>
                  <td className="whitespace-nowrap text-xs">{ORIGIN_LABELS[doc.origin]}</td>
                  <td className="whitespace-nowrap text-xs" title={DOCUMENT_TYPE_LABELS[doc.documentType ?? ""] ?? ""}>
                    {doc.documentType ?? "—"}
                  </td>
                  <td>
                    {doc.documentTitle}
                    {doc.originAgency && (
                      <span className="block text-xs text-ink-400 dark:text-white/30">{doc.originAgency}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    {doc.routedTo.length > 0 ? doc.routedTo.map((r) => r.user.name).join(", ") : "—"}
                  </td>
                  <td className="whitespace-nowrap">{doc.dueDate?.toLocaleDateString() ?? "—"}</td>
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
