import { prisma } from "@/lib/prisma";

// Shared lookups for DipcrForm, used by both the create and edit pages — the
// same arrangement as getIncomingFormData.
//
// This used to also gather the distinct Section and PAP names already in use,
// to offer as datalist suggestions on those two fields. The suggestions have
// been removed, so the two queries went with them rather than being left to run
// on every form load for a control nobody can see. Nothing about the stored
// data changed: both are still free text on DipcrIndicator.
export async function getDipcrFormData(officeId: string) {
  const users = await prisma.user.findMany({
    where: { officeId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return { users };
}
