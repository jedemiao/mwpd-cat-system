import { prisma } from "@/lib/prisma";

// How many recent activities to offer the outgoing form's "Link to Tentative
// Activity(s)" picker. The source tracker type-aheads over everything; a
// bounded recent list plus a client-side filter keeps this to one query and no
// search endpoint. Anything already linked is merged in regardless of age, so
// an old link never silently vanishes from the edit form.
const RECENT_ACTIVITY_LIMIT = 40;

function activityLabel(a: { date: Date; activityName: string; location: string | null }) {
  // Location is part of the label because their placeholder invites searching
  // by it — "Search by name, activity, or location…" — and the filter matches
  // against this string.
  const where = a.location ? ` · ${a.location}` : "";
  return `${a.date.toLocaleDateString()} — ${a.activityName}${where}`;
}

export async function getLinkableActivities(officeId: string, linkedActivityIds: string[] = []) {
  const [recent, linked] = await Promise.all([
    prisma.activity.findMany({
      where: { officeId },
      orderBy: { date: "desc" },
      take: RECENT_ACTIVITY_LIMIT,
      select: { id: true, date: true, activityName: true, location: true },
    }),
    linkedActivityIds.length > 0
      ? prisma.activity.findMany({
          where: { officeId, id: { in: linkedActivityIds } },
          select: { id: true, date: true, activityName: true, location: true },
        })
      : Promise.resolve([]),
  ]);

  const merged = new Map(recent.map((a) => [a.id, a]));
  for (const a of linked) merged.set(a.id, a);

  return [...merged.values()]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((a) => ({ id: a.id, label: activityLabel(a) }));
}
