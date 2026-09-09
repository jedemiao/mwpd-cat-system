import { prisma } from "@/lib/prisma";
import { OFFICE_TZ } from "@/lib/dressCode";
import { scannedCopyFileName } from "@/lib/scannedCopy";

/**
 * The office log: AuditLog rendered as something a person can read.
 *
 * Nothing new is recorded for this. Every module already writes to AuditLog on
 * create, update and delete (src/lib/auditLog.ts), plus a READ on every scanned
 * copy opened — rows written for accountability and, until now, never shown to
 * anybody. This is the reading end of that trail: the division's day, in order.
 *
 * The rows stay immutable. This module only ever reads.
 */

/** What each entity is called on screen, keyed by the Prisma model name the audit routes write. */
export const ENTITY_LABELS: Record<string, string> = {
  IncomingDocument: "incoming document",
  OutgoingDocument: "outgoing document",
  OutgoingVersion: "reply draft",
  InternalMemo: "internal memo",
  LegalAssistance: "legal assistance record",
  RegulationLicensing: "regulation and licensing record",
  IpcrRatingGuideRow: "IPCR rating guide row",
  DipcrIndicator: "D/IPCR indicator",
  SenaConference: "SENA conference",
  CallLog: "call log entry",
  DtrRecord: "DTR record",
  Activity: "activity",
  Leave: "leave record",
  User: "user account",
  File: "scanned copy",
};

/** The modules a reader thinks in, for the filter. Labels match the nav, not the model names. */
export const ENTITY_FILTERS: { value: string; label: string }[] = [
  { value: "IncomingDocument", label: "Incoming" },
  { value: "OutgoingDocument", label: "Outgoing" },
  { value: "OutgoingVersion", label: "Reply drafts" },
  { value: "InternalMemo", label: "Internal" },
  { value: "SenaConference", label: "SENA" },
  { value: "Activity", label: "Monthly activity" },
  { value: "Leave", label: "Leave" },
  { value: "DtrRecord", label: "DTR filing" },
  { value: "CallLog", label: "Call log" },
  { value: "LegalAssistance", label: "Legal assistance" },
  { value: "RegulationLicensing", label: "Regulation and Licensing" },
  { value: "IpcrRatingGuideRow", label: "IPCR Rating Guide" },
  { value: "DipcrIndicator", label: "D/IPCR" },
  { value: "User", label: "User accounts" },
  { value: "File", label: "Scanned copies" },
];

export const ACTION_FILTERS: { value: string; label: string }[] = [
  { value: "CREATE", label: "Added" },
  { value: "UPDATE", label: "Updated" },
  { value: "DELETE", label: "Deleted" },
  { value: "READ", label: "Opened" },
];

/**
 * The verb, chosen per entity as well as per action.
 *
 * "Created an OutgoingVersion" is what the table stores; "submitted v2" is what
 * the person actually did. A log is only worth opening if it uses the office's
 * own words for the office's own work.
 */
export function verbFor(action: string, entityType: string): string {
  if (entityType === "File") return "opened";
  if (entityType === "OutgoingVersion") {
    if (action === "CREATE") return "submitted";
    if (action === "UPDATE") return "checked";
  }
  switch (action) {
    case "CREATE":
      return "added";
    case "UPDATE":
      return "updated";
    case "DELETE":
      return "deleted";
    case "READ":
      return "opened";
    default:
      return action.toLowerCase();
  }
}

type Details = Record<string, unknown> | null;

/**
 * The record's name taken from the audit row's own JSON snapshot.
 *
 * This is what keeps a deleted record describable: the live row is gone, but
 * logAudit stored the whole thing at the moment it went. Without this, every
 * deletion — the entries a Chief most wants to see — would read as a bare id.
 */
function labelFromDetails(details: Details): string | null {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === "string" && d[k] ? (d[k] as string) : null);

  const number = str("routingNumber") ?? str("sourceRoutingNumber");
  const title = str("documentTitle") ?? str("subject") ?? str("requestingParty") ?? str("clientName");
  if (number && title) return `${number} — ${title}`;
  return number ?? title;
}

export type LogEntry = {
  id: string;
  at: Date;
  actor: string;
  action: string;
  entityType: string;
  /** "added", "deleted", "submitted" — already chosen for this entity. */
  verb: string;
  /** "outgoing document", "scanned copy". */
  entityLabel: string;
  /** The affected record's own name, where one could be recovered. */
  subject: string | null;
  /** Where to go to see it — only set when the record still exists. */
  href: string | null;
  /** True when a record that would normally be linkable is no longer there. */
  gone: boolean;
};

const HREF_BASE: Record<string, string> = {
  IncomingDocument: "/incoming",
  OutgoingDocument: "/outgoing",
  OutgoingVersion: "/outgoing",
  InternalMemo: "/internal",
  LegalAssistance: "/legal-assistance",
  RegulationLicensing: "/regulation-licensing",
  IpcrRatingGuideRow: "/ipcr-rating-guide",
  DipcrIndicator: "/dipcr",
  SenaConference: "/sena",
  CallLog: "/call-log",
  Activity: "/activities",
  Leave: "/leave",
};

type Resolved = { subject: string; href: string };

/**
 * Names the records a page of audit rows points at, in one query per model
 * rather than one per row.
 *
 * The obvious implementation looks each row up as it renders — twenty rows,
 * twenty round trips, and worse as the page grows. Grouping the ids by model
 * first means each model is asked exactly once.
 *
 * Only the ledgers are resolved. They are the overwhelming majority of entries
 * and the only ones carrying a routing number worth showing; everything else
 * falls back to its snapshot or to its type name, which reads perfectly well as
 * "Cherryl added a legal assistance record".
 */
async function resolveSubjects(
  rows: { entityType: string; entityId: string; details: Details }[],
): Promise<Map<string, Resolved>> {
  const out = new Map<string, Resolved>();
  const idsFor = (type: string) => [
    ...new Set(rows.filter((r) => r.entityType === type).map((r) => r.entityId)),
  ];

  const incomingIds = idsFor("IncomingDocument");
  const versionIds = idsFor("OutgoingVersion");

  // A version row's own record is gone the moment its dispatch is deleted, and
  // versions are the busiest thing in the log after the ledgers themselves. But
  // the audit snapshot names the dispatch it belonged to, so the entry can still
  // be resolved through its parent — which is where the reader wanted to go
  // anyway, since that is the page a version is read on.
  const versionParentIds = rows
    .filter((r) => r.entityType === "OutgoingVersion")
    .map((r) => (r.details && typeof r.details.outgoingId === "string" ? r.details.outgoingId : null))
    .filter((id): id is string => Boolean(id));

  const outgoingIds = [...new Set([...idsFor("OutgoingDocument"), ...versionParentIds])];

  const [incoming, outgoing, versions] = await Promise.all([
    incomingIds.length
      ? prisma.incomingDocument.findMany({
          where: { id: { in: incomingIds } },
          select: { id: true, routingNumber: true, documentTitle: true },
        })
      : [],
    outgoingIds.length
      ? prisma.outgoingDocument.findMany({
          where: { id: { in: outgoingIds } },
          select: { id: true, routingNumber: true, documentTitle: true },
        })
      : [],
    versionIds.length
      ? prisma.outgoingVersion.findMany({
          where: { id: { in: versionIds } },
          select: {
            id: true,
            versionNumber: true,
            outgoing: { select: { id: true, routingNumber: true, documentTitle: true } },
          },
        })
      : [],
  ]);

  const nameOutgoing = (d: { routingNumber: string | null; documentTitle: string }) =>
    d.routingNumber ? `${d.routingNumber} — ${d.documentTitle}` : d.documentTitle;

  for (const d of incoming) {
    out.set(`IncomingDocument:${d.id}`, {
      subject: `${d.routingNumber} — ${d.documentTitle}`,
      href: `/incoming/${d.id}`,
    });
  }

  const outgoingById = new Map(outgoing.map((d) => [d.id, d]));
  for (const d of outgoing) {
    out.set(`OutgoingDocument:${d.id}`, { subject: nameOutgoing(d), href: `/outgoing/${d.id}` });
  }

  // A version's audit row identifies the version, but the reader wants the
  // dispatch it belongs to — that is what carries the number, and the page.
  for (const v of versions) {
    out.set(`OutgoingVersion:${v.id}`, {
      subject: `v${v.versionNumber} of ${v.outgoing.routingNumber ?? v.outgoing.documentTitle}`,
      href: `/outgoing/${v.outgoing.id}`,
    });
  }

  // Then the versions whose own row is gone but whose dispatch survives.
  for (const r of rows) {
    if (r.entityType !== "OutgoingVersion") continue;
    if (out.has(`OutgoingVersion:${r.entityId}`)) continue;

    const parentId = typeof r.details?.outgoingId === "string" ? r.details.outgoingId : null;
    const number = typeof r.details?.versionNumber === "number" ? r.details.versionNumber : null;
    const parent = parentId ? outgoingById.get(parentId) : undefined;
    if (!parent && number === null) continue;

    out.set(`OutgoingVersion:${r.entityId}`, {
      subject: parent
        ? `v${number ?? "?"} of ${nameOutgoing(parent)}`
        : `v${number} of a deleted dispatch`,
      href: parent ? `/outgoing/${parent.id}` : "",
    });
  }

  return out;
}

/** One page of the office's log, already resolved into readable entries. */
export async function getOfficeLog(opts: {
  officeId: string;
  q?: string;
  userId?: string;
  entityType?: string;
  action?: string;
  from?: Date;
  to?: Date;
  skip: number;
  take: number;
}): Promise<{ entries: LogEntry[]; total: number }> {
  const where = {
    officeId: opts.officeId,
    ...(opts.userId ? { userId: opts.userId } : {}),
    ...(opts.entityType ? { entityType: opts.entityType } : {}),
    ...(opts.action ? { action: opts.action } : {}),
    ...(opts.from || opts.to
      ? { createdAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lt: opts.to } : {}) } }
      : {}),
    // Free text reaches the person who acted, and the record's id. The subject
    // line is assembled after the query, so it is not itself searchable in SQL —
    // the person and module filters are what narrow this in practice, and they
    // are the ones staff actually reach for.
    ...(opts.q
      ? {
          OR: [
            { user: { name: { contains: opts.q, mode: "insensitive" as const } } },
            { entityId: { contains: opts.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      // createdAt is a real timestamp, so this needs no tie-breaker for
      // correctness — id only holds two writes inside the same millisecond in a
      // fixed order rather than an arbitrary one, which matters under skip/take.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: opts.skip,
      take: opts.take,
      include: { user: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const resolved = await resolveSubjects(
    rows.map((r) => ({ entityType: r.entityType, entityId: r.entityId, details: r.details as Details })),
  );

  const entries = rows.map((r): LogEntry => {
    const hit = resolved.get(`${r.entityType}:${r.entityId}`);
    const snapshot = labelFromDetails(r.details as Details);
    // A file's audit row records the object key, which ends in the uploaded
    // filename — of far more use to a reader than the key itself.
    const fromKey = r.entityType === "File" ? scannedCopyFileName(r.entityId) : null;

    return {
      id: r.id,
      at: r.createdAt,
      actor: r.user?.name ?? "Unknown user",
      action: r.action,
      entityType: r.entityType,
      verb: verbFor(r.action, r.entityType),
      entityLabel: ENTITY_LABELS[r.entityType] ?? r.entityType,
      subject: hit?.subject ?? snapshot ?? fromKey,
      // Linked only where the record is still there. A link to a deleted row is
      // a 404 dressed up as a destination.
      href: hit?.href || null,
      // Deletions are expected to be unresolvable and say so already through
      // their own verb; this marks the other case — a record that went missing
      // some other way, where a reader would otherwise wonder why there is no link.
      gone: !hit && r.action !== "DELETE" && r.entityType !== "File" && Boolean(HREF_BASE[r.entityType]),
    };
  });

  return { entries, total };
}

/**
 * Midnight in Butuan for a yyyy-mm-dd from a date input, as a UTC instant.
 *
 * The filter has to mean the office's own day. Handing the string to `new Date`
 * would give midnight UTC — 8am in Butuan — quietly pushing eight hours of every
 * morning into the previous day's results.
 */
export function officeDayStart(day: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  // Philippine Standard Time is UTC+8 all year; the country keeps no DST.
  const at = new Date(`${day}T00:00:00+08:00`);
  return Number.isNaN(at.getTime()) ? undefined : at;
}

/** The instant the office's day ends, as an exclusive upper bound. */
export function officeDayEnd(day: string): Date | undefined {
  const start = officeDayStart(day);
  if (!start) return undefined;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: OFFICE_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayHeadingFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: OFFICE_TZ,
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: OFFICE_TZ,
  hour: "numeric",
  minute: "2-digit",
});

/** The clock time in the office, which is the only time a reader here means. */
export function officeTime(at: Date): string {
  return timeFormat.format(at);
}

/**
 * The entries of one page, split into the days they happened on.
 *
 * A flat list of timestamps is a database table. Staff asked to watch the day,
 * so the day is the unit: each heading is a date in the office's own timezone,
 * and today and yesterday are named rather than dated, because that is how
 * someone scanning for "what happened this morning" actually reads a page.
 */
export function groupByDay(
  entries: LogEntry[],
  now: Date = new Date(),
): { key: string; heading: string; entries: LogEntry[] }[] {
  const todayKey = dayKeyFormat.format(now);
  const yesterdayKey = dayKeyFormat.format(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  const days: { key: string; heading: string; entries: LogEntry[] }[] = [];
  for (const entry of entries) {
    const key = dayKeyFormat.format(entry.at);
    let day = days.find((d) => d.key === key);
    if (!day) {
      const heading =
        key === todayKey ? "Today" : key === yesterdayKey ? "Yesterday" : dayHeadingFormat.format(entry.at);
      day = { key, heading, entries: [] };
      days.push(day);
    }
    day.entries.push(entry);
  }
  return days;
}
