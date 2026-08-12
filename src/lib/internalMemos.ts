import { prisma } from "@/lib/prisma";

// The internal memorandum register is MWPTD's (Office.tracksInternalMemos). One
// function behind every consumer — the three pages, both API routes and the nav
// — so an office either has the module or does not, and a new consumer cannot
// reintroduce it for an office that keeps no such register.
//
// This gates routes, not just what is drawn. Hiding the nav entry is convenience;
// without the checks in the API handlers, /api/internal would still list and
// create memoranda for any signed-in user who knew the URL.
export async function officeTracksInternalMemos(officeId: string): Promise<boolean> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { tracksInternalMemos: true },
  });
  return office?.tracksInternalMemos ?? false;
}
