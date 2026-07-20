import { prisma } from "@/lib/prisma";

// Documents due within this many days (and not yet completed) count as
// "due soon" for alerting purposes.
const DUE_SOON_DAYS = 2;

function dueSoonCutoff(from: Date): Date {
  const cutoff = new Date(from);
  cutoff.setDate(cutoff.getDate() + DUE_SOON_DAYS);
  return cutoff;
}

// Lightweight counts for the nav badge — cheap enough to run on every page load.
export async function getArtaAlertCounts(officeId: string) {
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
