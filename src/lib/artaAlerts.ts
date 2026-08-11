import { prisma } from "@/lib/prisma";

// Documents due within this many days (and not yet completed) count as
// "due soon" for alerting purposes.
const DUE_SOON_DAYS = 2;

function dueSoonCutoff(from: Date): Date {
  const cutoff = new Date(from);
  cutoff.setDate(cutoff.getDate() + DUE_SOON_DAYS);
  return cutoff;
}

// Only MWPTD is subject to ARTA; the other divisions and ORD are exempt
// (Office.tracksArta). Gating here rather than at each call site is deliberate:
// these two functions feed the nav badge, the dashboard compliance board, the
// Incoming banner and the notification bell, so one check keeps all four
// consistent and means a new consumer can't reintroduce the alerts for an
// office that has no duty to act on them.
export async function officeTracksArta(officeId: string): Promise<boolean> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { tracksArta: true },
  });
  return office?.tracksArta ?? false;
}

// Lightweight counts for the nav badge — cheap enough to run on every page load.
export async function getArtaAlertCounts(officeId: string) {
  if (!(await officeTracksArta(officeId))) return { overdue: 0, dueSoon: 0 };

  const now = new Date();

  const [overdue, dueSoon] = await Promise.all([
    prisma.incomingDocument.count({
      where: { officeId, dateCompleted: null, dueDate: { lt: now } },
    }),
    prisma.incomingDocument.count({
      where: { officeId, dateCompleted: null, dueDate: { gte: now, lte: dueSoonCutoff(now) } },
    }),
  ]);

  return { overdue, dueSoon };
}

// Full document details for the Incoming page's alert banner.
export async function getArtaAlertDocuments(officeId: string) {
  if (!(await officeTracksArta(officeId))) return { overdueDocs: [], dueSoonDocs: [] };

  const now = new Date();

  const [overdueDocs, dueSoonDocs] = await Promise.all([
    prisma.incomingDocument.findMany({
      where: { officeId, dateCompleted: null, dueDate: { lt: now } },
      orderBy: { dueDate: "asc" },
      select: { id: true, routingNumber: true, documentTitle: true, dueDate: true },
    }),
    prisma.incomingDocument.findMany({
      where: { officeId, dateCompleted: null, dueDate: { gte: now, lte: dueSoonCutoff(now) } },
      orderBy: { dueDate: "asc" },
      select: { id: true, routingNumber: true, documentTitle: true, dueDate: true },
    }),
  ]);

  return { overdueDocs, dueSoonDocs };
}
