import { prisma } from "@/lib/prisma";

// Shared lookups for IncomingForm, used by both the create and edit pages.
//
// This used to also assemble the activity list for the form's "Related
// activities" picker. That field has been removed, so the two activity queries
// went with it — they were the expensive part of this function and were running
// on every form load for a control nobody could see. The link itself is intact:
// IncomingDocumentActivity still exists, both API routes still accept
// activityIds, and existing links are untouched because a PATCH that omits the
// field leaves them alone.
export async function getIncomingFormData(officeId: string) {
  const [users, agencyRows, signatoryRows] = await Promise.all([
    prisma.user.findMany({
      where: { officeId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
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

  return {
    users,
    agencySuggestions: agencyRows.map((r) => r.originAgency!).filter(Boolean),
    signatorySuggestions: signatoryRows.map((r) => r.signatory!).filter(Boolean),
  };
}
