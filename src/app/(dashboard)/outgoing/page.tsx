import { getServerSession } from "next-auth";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { scannedCopyFileName } from "@/lib/scannedCopy";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSignOffAsChief } from "@/lib/authz";
import { Pagination } from "@/components/Pagination";
import { Badge } from "@/components/Badge";
import { PrintLink, listHref } from "@/components/PrintLink";
import { PrintToolbar } from "@/components/PrintToolbar";
import { PrintHeader } from "@/components/PrintHeader";
import { PlusIcon, SearchIcon } from "@/components/icons";
import { DOCUMENT_TYPE_OTHER_CODE, documentTypeLabel } from "@/lib/documentTypeCodes";
import {
  OUTGOING_STATUS_LABELS,
  OUTGOING_STATUS_HINTS,
  OUTGOING_STATUS_VARIANT,
  WORK_BOARD_ORDER,
} from "@/lib/outgoingStatus";
import { formatReceivingOfficeLabels } from "@/lib/receivingOffices";
import { ClickableRow } from "@/components/ClickableRow";

const PAGE_SIZE = 20;
const PRINT_MAX = 2000;

const FILING_LABELS: Record<string, string> = { pending: "Pending", filed: "Filed" };

type SearchParams = {
  q?: string;
  status?: string;
  view?: string;
  mine?: string;
  page?: string;
  print?: string;
};

// Two views of one module, because the office does two different things here.
//
//  - The WORK BOARD is where the division works. Every document the Division
//    Chief routes is answered, and the answer is written, checked and revised
//    here before it goes anywhere. Nothing on this board has left the building.
//  - The REGISTER is the ledger that has always existed: what was dispatched,
//    to whom, and whether they signed for it.
//
// The board is the default. A register is a record of finished work, and
// landing staff on it every morning would open the module on the one list that
// never tells them what they still have to do.
export default async function OutgoingPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;
  const isChief = canSignOffAsChief(session!.user.role);

  const q = searchParams.q?.trim() ?? "";
  const filing = searchParams.status ?? "all";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const isPrint = searchParams.print === "1";
  // Printing only ever means the register — a work board is a live queue, and a
  // printed copy of it is out of date before it leaves the tray.
  const view = isPrint || searchParams.view === "released" ? "released" : "work";

  // Staff open the board on their own work; the Chief opens it on the whole
  // division's, because the Chief's job here is to see everything waiting. Both
  // can switch — this decides the default, not the permission.
  const mine = searchParams.mine ? searchParams.mine === "1" : !isChief;

  const searchWhere: Prisma.OutgoingDocumentWhereInput = q
    ? {
        OR: [
          { documentTitle: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { routingNumber: { contains: q, mode: Prisma.QueryMode.insensitive } },
        ],
      }
    : {};

  if (view === "work") {
    // "Mine" reaches through the reply to the incoming document it answers:
    // work is assigned on the incoming side, by the Chief, and the reply
    // inherits that assignment rather than carrying a second one that could
    // disagree with it. An originated dispatch answers nothing, so it has no
    // assignee — it belongs to whoever is looking at the whole board.
    const mineWhere: Prisma.OutgoingDocumentWhereInput = mine
      ? { relatedIncoming: { routedTo: { some: { userId: session!.user.id } } } }
      : {};

    const where: Prisma.OutgoingDocumentWhereInput = {
      officeId,
      status: { not: "RELEASED" },
      ...mineWhere,
      ...searchWhere,
    };

    const [docs, total] = await Promise.all([
      prisma.outgoingDocument.findMany({
        where,
        // Oldest first: the board is a queue, and the thing that has been
        // waiting longest is the thing most likely to be forgotten.
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          _count: { select: { versions: true } },
          relatedIncoming: {
            select: {
              id: true,
              routingNumber: true,
              routedTo: { include: { user: { select: { name: true } } } },
            },
          },
        },
      }),
      prisma.outgoingDocument.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const byStatus = WORK_BOARD_ORDER.map((s) => ({
      status: s,
      count: docs.filter((d) => d.status === s).length,
    })).filter((s) => s.count > 0);

    return (
      <main className="space-y-4 p-6 lg:p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Outgoing</h1>
          <div className="flex gap-2">
            <PrintLink basePath="/outgoing" searchParams={{ view: "released" }} />
            <Link href="/outgoing/new" className="btn-primary">
              <PlusIcon className="h-4 w-4" />
              New
            </Link>
          </div>
        </div>

        <ViewTabs view="work" q={q} mine={mine} isChief={isChief} />

        {/* What is on the board right now, by whose move it is. Written as a
            sentence rather than a row of tiles: on a good day this is two or
            three numbers, and four tiles of mostly zeroes would read worse. */}
        {byStatus.length > 0 && (
          <p className="text-sm text-ink-500 dark:text-white/40">
            {byStatus.map((s, i) => (
              <span key={s.status}>
                {i > 0 && " · "}
                <span className="font-medium text-ink-900 dark:text-white">{s.count}</span>{" "}
                {OUTGOING_STATUS_LABELS[s.status].toLowerCase()}
              </span>
            ))}
          </p>
        )}

        <form action="/outgoing" method="get" className="flex gap-2">
          <input type="hidden" name="view" value="work" />
          <input type="hidden" name="mine" value={mine ? "1" : "0"} />
          <div className="relative w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/30" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search routing number or title…"
              className="field-input pl-9"
            />
          </div>
          <button type="submit" className="btn-dark">
            Search
          </button>
        </form>

        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Routing number</th>
                <th>Document</th>
                <th>Answering</th>
                <th>With</th>
                <th>Versions</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <ClickableRow key={doc.id} href={`/outgoing/${doc.id}`}>
                  <td className="whitespace-nowrap font-mono text-xs">
                    {doc.routingNumber ?? <span className="font-sans text-ink-400 dark:text-white/30">Numbered at release</span>}
                  </td>
                  <td>{doc.documentTitle}</td>
                  <td className="whitespace-nowrap">
                    {doc.relatedIncoming ? (
                      <Link
                        href={`/incoming/${doc.relatedIncoming.id}`}
                        className="font-mono text-xs text-info hover:underline"
                      >
                        {doc.relatedIncoming.routingNumber}
                      </Link>
                    ) : (
                      <span className="text-ink-400 dark:text-white/30">Originated here</span>
                    )}
                  </td>
                  <td>
                    {doc.relatedIncoming && doc.relatedIncoming.routedTo.length > 0
                      ? doc.relatedIncoming.routedTo.map((r) => r.user.name).join(", ")
                      : "—"}
                  </td>
                  {/* Submissions, not rejections: a reply approved first time
                      reads 1. Dash while nothing has been submitted at all. */}
                  <td className="whitespace-nowrap">{doc._count.versions || "—"}</td>
                  <td className="whitespace-nowrap">
                    <Badge variant={OUTGOING_STATUS_VARIANT[doc.status]}>{OUTGOING_STATUS_LABELS[doc.status]}</Badge>
                    <span className="ml-2 text-xs text-ink-500 dark:text-white/40">
                      {OUTGOING_STATUS_HINTS[doc.status]}
                    </span>
                  </td>
                  <td>
                    <Link href={`/outgoing/${doc.id}`} className="font-medium text-primary hover:text-primary-600">
                      Open
                    </Link>
                  </td>
                </ClickableRow>
              ))}
              {docs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-ink-500 dark:text-white/40">
                    {mine
                      ? "Nothing assigned to you is waiting. Documents appear here once the Division Chief routes one to you and a reply is started."
                      : "Nothing is in progress. Replies appear here when they are started from a received document."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          basePath="/outgoing"
          page={page}
          totalPages={totalPages}
          total={total}
          searchParams={{ q, view: "work", mine: mine ? "1" : "0" }}
        />
      </main>
    );
  }

  const filingWhere: Prisma.OutgoingDocumentWhereInput =
    filing === "filed" ? { filed: true } : filing === "pending" ? { filed: false } : {};

  const where: Prisma.OutgoingDocumentWhereInput = {
    officeId,
    // The register is documents that actually left the building. A draft, or a
    // reply still going back and forth with the Division Chief, has not been
    // dispatched — and a register row is a claim that something was.
    status: "RELEASED",
    ...filingWhere,
    ...searchWhere,
  };

  const [docs, total, office] = await Promise.all([
    prisma.outgoingDocument.findMany({
      where,
      // Tie-broken by entry order for the same reason as the incoming register:
      // dateReleased is a bare date, so a day's dispatches sort equal and the
      // order would otherwise drift between requests and break pagination.
      orderBy: [{ dateReleased: "desc" }, { createdAt: "desc" }],
      skip: isPrint ? undefined : (page - 1) * PAGE_SIZE,
      take: isPrint ? PRINT_MAX : PAGE_SIZE,
    }),
    prisma.outgoingDocument.count({ where }),
    // name is only needed for the printed letterhead, but detailedLedgerColumns
    // decides which layout renders, so this now runs on every load.
    prisma.office.findUnique({ where: { id: officeId }, select: { name: true, detailedLedgerColumns: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const backHref = listHref("/outgoing", {
    q,
    status: filing !== "all" ? filing : undefined,
    view: "released",
  });
  const detailedColumns = office?.detailedLedgerColumns ?? false;

  return (
    <main className="space-y-4 p-6 lg:p-8">
      {isPrint ? (
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">
            Outgoing documents <span className="text-ink-400 dark:text-white/30">· print preview</span>
          </h1>
          <PrintToolbar backHref={backHref} />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Outgoing</h1>
            <div className="flex gap-2">
              <PrintLink
                basePath="/outgoing"
                searchParams={{ q, status: filing !== "all" ? filing : undefined, view: "released" }}
              />
              <Link href="/outgoing/new" className="btn-primary">
                <PlusIcon className="h-4 w-4" />
                New
              </Link>
            </div>
          </div>
          <ViewTabs view="released" q={q} mine={mine} isChief={isChief} />
        </>
      )}

      {isPrint && (
        <PrintHeader
          officeName={office?.name ?? ""}
          title="Outgoing documents"
          filters={[
            { label: "Search", value: q },
            { label: "Status", value: FILING_LABELS[filing] ?? "" },
          ]}
          total={total}
          generatedBy={session!.user.name ?? "—"}
          truncatedAt={PRINT_MAX}
        />
      )}

      {!isPrint && (
        <form action="/outgoing" method="get" className="flex gap-2">
          <input type="hidden" name="view" value="released" />
          <div className="relative w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/30" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search routing number or title…"
              className="field-input pl-9"
            />
          </div>
          <select name="status" defaultValue={filing} className="field-input w-auto">
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="filed">Filed</option>
          </select>
          <button type="submit" className="btn-dark">
            Search
          </button>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            {/* Two layouts, same as the incoming ledger and gated on the same
                flag. The register layout follows the office's own outgoing
                register (mwpsd_tracker/…view_outgoing_internal.php.png), whose
                last four columns are the receipt: which office took delivery,
                who signed, and when. "Answers incoming #" and Status are ours
                and have no counterpart there, but they carry the cross-ledger
                link and filing state, so they stay. */}
            {detailedColumns ? (
              <tr>
                <th>Date</th>
                <th>Tracking No.</th>
                <th>Type of Document</th>
                <th>Particulars</th>
                <th>Office</th>
                <th>Name</th>
                <th>Date Received</th>
                <th>Time</th>
                <th>Status</th>
                <th>Scanned copy</th>
                <th className="print:hidden"></th>
              </tr>
            ) : (
              <tr>
                <th>Date released</th>
                <th>Routing number</th>
                <th>Document title</th>
                <th>Received by</th>
                <th>Status</th>
                <th>Scanned copy</th>
                <th className="print:hidden"></th>
              </tr>
            )}
          </thead>
          <tbody>
            {docs.map((doc) => (
              <ClickableRow key={doc.id} href={`/outgoing/${doc.id}`}>
                {detailedColumns ? (
                  <>
                    <td className="whitespace-nowrap">{doc.dateReleased?.toLocaleDateString() ?? "—"}</td>
                    <td className="whitespace-nowrap font-mono text-xs">{doc.routingNumber ?? "—"}</td>
                    <td
                      className="whitespace-nowrap text-xs"
                      title={documentTypeLabel(doc.documentType, doc.documentTypeOther)}
                    >
                      {doc.documentType === DOCUMENT_TYPE_OTHER_CODE
                        ? doc.documentTypeOther || DOCUMENT_TYPE_OTHER_CODE
                        : (doc.documentType ?? "—")}
                    </td>
                    <td>{doc.documentTitle}</td>
                    <td className="whitespace-nowrap">{formatReceivingOfficeLabels(doc.receivingOffice) || "—"}</td>
                    <td className="whitespace-nowrap">{doc.receivedBy ?? "—"}</td>
                    <td className="whitespace-nowrap">{doc.receivedDate?.toLocaleDateString() ?? "—"}</td>
                    <td className="whitespace-nowrap text-xs">{doc.receivedTime ?? "—"}</td>
                  </>
                ) : (
                  <>
                    <td className="whitespace-nowrap">{doc.dateReleased?.toLocaleDateString() ?? "—"}</td>
                    <td className="whitespace-nowrap font-mono text-xs">{doc.routingNumber ?? "—"}</td>
                    <td>{doc.documentTitle}</td>
                  </>
                )}
                {!detailedColumns && <td>{doc.receivedBy ?? "—"}</td>}
                <td className="whitespace-nowrap">
                  {doc.filed ? <Badge variant="success">Filed</Badge> : <Badge variant="warning">Pending</Badge>}
                </td>
                <td>
                  {isPrint ? (
                    doc.scannedCopyUrl ? (
                      "Yes"
                    ) : (
                      "—"
                    )
                  ) : doc.scannedCopyUrl ? (
                    <a
                      href={`/api/files/${doc.scannedCopyUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      title={scannedCopyFileName(doc.scannedCopyUrl)}
                      // The name can be long and this is one column among many, so it is
                      // clipped to the column rather than allowed to widen the table; the
                      // title above gives the whole thing on hover.
                      className="block max-w-[14rem] truncate text-info hover:underline"
                    >
                      {scannedCopyFileName(doc.scannedCopyUrl)}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="print:hidden">
                  <Link href={`/outgoing/${doc.id}`} className="font-medium text-primary hover:text-primary-600">
                    Edit
                  </Link>
                </td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
      </div>

      {!isPrint && (
        <Pagination
          basePath="/outgoing"
          page={page}
          totalPages={totalPages}
          total={total}
          searchParams={{ q, status: filing, view: "released" }}
        />
      )}
    </main>
  );
}

// The two views, plus the board's own scope switch. Rendered as links rather
// than a client component: every piece of state here is already in the URL, so
// there is nothing for JavaScript to hold.
function ViewTabs({
  view,
  q,
  mine,
  isChief,
}: {
  view: "work" | "released";
  q: string;
  mine: boolean;
  isChief: boolean;
}) {
  const tab = (active: boolean) =>
    `border-b-2 px-1 pb-2 text-sm ${
      active
        ? "border-primary font-medium text-ink-900 dark:text-white"
        : "border-transparent text-ink-500 hover:text-ink-900 dark:text-white/40 dark:hover:text-white"
    }`;

  const qs = (params: Record<string, string>) => {
    const usp = new URLSearchParams(params);
    if (q) usp.set("q", q);
    return `/outgoing?${usp.toString()}`;
  };

  return (
    <div className="flex items-center justify-between border-b border-ink-400/15 dark:border-white/10">
      <nav className="flex gap-6">
        <Link href={qs({ view: "work", mine: mine ? "1" : "0" })} className={tab(view === "work")}>
          Work board
        </Link>
        <Link href={qs({ view: "released" })} className={tab(view === "released")}>
          Released
        </Link>
      </nav>

      {view === "work" && (
        <div className="flex gap-4 pb-2 text-sm">
          <Link
            href={qs({ view: "work", mine: "1" })}
            className={mine ? "font-medium text-ink-900 dark:text-white" : "text-ink-500 dark:text-white/40"}
          >
            Mine
          </Link>
          <Link
            href={qs({ view: "work", mine: "0" })}
            className={!mine ? "font-medium text-ink-900 dark:text-white" : "text-ink-500 dark:text-white/40"}
          >
            {isChief ? "Whole division" : "All"}
          </Link>
        </div>
      )}
    </div>
  );
}
