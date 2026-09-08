import { DeliveryStatus, OutgoingStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canSignOffAsChief } from "@/lib/authz";

const RECENT_LIMIT = 5;

// Documents currently routed to this user that they haven't finished yet —
// their live "assigned to you" queue, shown in the notification bell.
export async function getRoutedToMeSummary(officeId: string, userId: string) {
  const where = { officeId, dateCompleted: null, routedTo: { some: { userId } } };

  const [count, docs] = await Promise.all([
    prisma.incomingDocument.count({ where }),
    prisma.incomingDocument.findMany({
      where,
      orderBy: { dateReceived: "desc" },
      take: RECENT_LIMIT,
      select: { id: true, routingNumber: true, documentTitle: true },
    }),
  ]);

  return { count, docs };
}

// The two review hand-offs, read from the documents' current status rather
// than from a log of events.
//
// Why derived and not stored: the live toast in NotificationBell is delivered
// through an in-memory EventEmitter (see notifyBus.ts) to whatever tabs happen
// to be open at that instant. A Chief whose browser was closed when staff
// submitted, or who was looking elsewhere for the seven seconds the toast
// lasts, was never told at all — the event had no listener and nothing kept
// it. Status is the durable record of the same fact: FOR_CHECKING *means* "the
// Chief has not answered this yet". Reading it back survives restarts, missed
// toasts and re-logins, and it cannot drift out of step with the board the way
// a separate notifications table would.
export async function getOutgoingReviewQueues(officeId: string, userId: string, role: Role) {
  // Only the Chief (or an Admin standing in) can record an outcome, so only
  // they are shown a checking queue — the same boundary as canSignOffAsChief,
  // which is what actually gates the review route.
  const forCheckingWhere = canSignOffAsChief(role)
    ? { officeId, status: OutgoingStatus.FOR_CHECKING }
    : null;

  // Whoever has to redo the work: the staff the answered incoming was routed
  // to, plus anyone who has submitted a version of this reply. Mirrors exactly
  // who POST /api/outgoing/[id]/versions/[versionId] notifies, so the bell and
  // the toast never disagree about whose desk it is on.
  const returnedWhere = {
    officeId,
    status: OutgoingStatus.RETURNED,
    OR: [
      { relatedIncoming: { routedTo: { some: { userId } } } },
      { versions: { some: { submittedById: userId } } },
    ],
  };

  const select = {
    id: true,
    routingNumber: true,
    documentTitle: true,
    // An originated dispatch has no routing number until it is released, so
    // the version number is the only name it has in the meantime — the same
    // fallback the toast uses.
    versions: {
      orderBy: { versionNumber: "desc" as const },
      take: 1,
      select: { versionNumber: true },
    },
  };

  const [forCheckingCount, forCheckingDocs, returnedCount, returnedDocs] = await Promise.all([
    forCheckingWhere ? prisma.outgoingDocument.count({ where: forCheckingWhere }) : 0,
    forCheckingWhere
      ? prisma.outgoingDocument.findMany({
          where: forCheckingWhere,
          orderBy: { updatedAt: "desc" },
          take: RECENT_LIMIT,
          select,
        })
      : [],
    prisma.outgoingDocument.count({ where: returnedWhere }),
    prisma.outgoingDocument.findMany({
      where: returnedWhere,
      orderBy: { updatedAt: "desc" },
      take: RECENT_LIMIT,
      select,
    }),
  ]);

  return {
    forChecking: { count: forCheckingCount, docs: forCheckingDocs.map(toQueueDoc) },
    returned: { count: returnedCount, docs: returnedDocs.map(toQueueDoc) },
  };
}

function toQueueDoc(doc: {
  id: string;
  routingNumber: string | null;
  documentTitle: string;
  versions: { versionNumber: number }[];
}) {
  return {
    id: doc.id,
    routingNumber: doc.routingNumber ?? (doc.versions[0] ? `v${doc.versions[0].versionNumber}` : "Unnumbered"),
    documentTitle: doc.documentTitle,
  };
}

// Documents another division has released to this office and nobody here has
// filed yet. Derived from delivery status for the same reason the review queues
// are derived from document status: the live toast reaches whoever had a tab
// open at that instant, and a delivery that arrived overnight must still be
// findable in the morning.
export async function getDeliveryQueue(officeId: string) {
  const where = { toOfficeId: officeId, status: DeliveryStatus.PENDING };

  const [count, rows] = await Promise.all([
    prisma.documentDelivery.count({ where }),
    prisma.documentDelivery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        outgoing: { select: { documentTitle: true, office: { select: { code: true } } } },
      },
    }),
  ]);

  return {
    count,
    docs: rows.map((row) => ({
      id: row.id,
      // The sending division, where the other queues put a routing number: it
      // is the first thing the reader wants, and the document has no number in
      // this office until it is filed.
      routingNumber: `From ${row.outgoing.office.code}`,
      documentTitle: row.outgoing.documentTitle,
    })),
  };
}
