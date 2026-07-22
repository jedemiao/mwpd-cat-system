import { prisma } from "@/lib/prisma";

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
