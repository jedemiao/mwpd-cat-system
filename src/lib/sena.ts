import { prisma } from "@/lib/prisma";

// The SENA conference register is MWPTD's (Office.tracksSena). One function
// behind every consumer — the three pages, both API routes and the nav — so an
// office either has the module or does not. Gates routes, not just what is
// drawn: hiding a nav entry is convenience, the boundary is the 404 in the
// handler. Same shape as officeTracksDtr.
export async function officeTracksSena(officeId: string): Promise<boolean> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { tracksSena: true },
  });
  return office?.tracksSena ?? false;
}

// The telephone log, gated the same way (Office.tracksCallLog). Kept in this
// file rather than a third one-function module: both are MWPTD's registers and
// both are read by the same nav.
export async function officeTracksCallLog(officeId: string): Promise<boolean> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { tracksCallLog: true },
  });
  return office?.tracksCallLog ?? false;
}
