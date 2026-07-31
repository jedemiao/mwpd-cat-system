import { prisma } from "@/lib/prisma";

// How many recent activities to offer for linking. The source tracker uses a
// type-ahead over everything; a bounded recent list keeps the checkbox group
// usable without introducing a search component, and anything already linked
// is merged in regardless of age so an old link never silently disappears from
// the edit form.
const RECENT_ACTIVITY_LIMIT = 40;

function activityLabel(a: { date: Date; activityName: string }) {
  return `${a.date.toLocaleDateString()} — ${a.activityName}`;
}

// Shared lookups for IncomingForm, used by both the create and edit pages.
export async function getIncomingFormData(officeId: string, linkedActivityIds: string[] = []) {
  const [users, recentActivities, linkedActivities, agencyRows, signatoryRows] = await Promise.all([
    prisma.user.findMany({
      where: { officeId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.activity.findMany({
      where: { officeId },
      orderBy: { date: "desc" },
      take: RECENT_ACTIVITY_LIMIT,
      select: { id: true, date: true, activityName: true },
    }),
    linkedActivityIds.length > 0
      ? prisma.activity.findMany({
          where: { officeId, id: { in: linkedActivityIds } },
          select: { id: true, date: true, activityName: true },
        })
      : Promise.resolve([]),
    // Suggestions come from what the office has already typed, exactly as the
    // source tracker builds its filter dropdowns — no reference table to keep.
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
  ]);

  const merged = new Map(recentActivities.map((a) => [a.id, a]));
  for (const a of linkedActivities) merged.set(a.id, a);

  return {
    users,
    activities: [...merged.values()]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map((a) => ({ id: a.id, label: activityLabel(a) })),
    agencySuggestions: agencyRows.map((r) => r.originAgency!).filter(Boolean),
    signatorySuggestions: signatoryRows.map((r) => r.signatory!).filter(Boolean),
  };
}
