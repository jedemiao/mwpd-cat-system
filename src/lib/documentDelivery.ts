import { prisma } from "@/lib/prisma";

/**
 * The tenant offices a set of ticked codes actually names.
 *
 * The tick list and the Office table are deliberately different rosters (see
 * the note at the top of receivingOffices.ts), so this is an explicit lookup
 * rather than string equality: a code matches Office.code either exactly or as
 * its leading segment. Every office matches exactly today, but the prefix rule
 * stays — it is what let the tick "MWPTD" find an office registered as
 * "MWPTD-CARAGA" before that was renamed, and a later regional unit could
 * arrive in the same shape.
 *
 * Codes naming no tenant — ARD and ADJU today — simply return nothing. A
 * dispatch to them stays a line in the sender's own register, because there is
 * no division here to deliver it to.
 *
 * Lives here rather than beside the tick list because it touches the database,
 * and receivingOffices.ts is imported by the Outgoing form — a client component,
 * which must not pull Prisma into its bundle.
 */
export async function resolveReceivingOffices(
  codes: readonly string[],
): Promise<{ id: string; code: string }[]> {
  if (codes.length === 0) return [];

  const offices = await prisma.office.findMany({ select: { id: true, code: true } });
  const wanted = codes.map((c) => c.toUpperCase());

  return offices.filter((office) => {
    const officeCode = office.code.toUpperCase();
    return wanted.some((code) => officeCode === code || officeCode.startsWith(`${code}-`));
  });
}

/**
 * The deliveries waiting on this office to take them in.
 *
 * Scoped by toOfficeId, which is the whole access rule for this table: a
 * delivery is readable by the division it is addressed to, and by nobody else.
 * The sending division sees the other side of it through its own dispatch.
 */
export async function getPendingDeliveries(officeId: string) {
  return prisma.documentDelivery.findMany({
    where: { toOfficeId: officeId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: {
      outgoing: {
        select: {
          id: true,
          routingNumber: true,
          documentTitle: true,
          documentType: true,
          dateReleased: true,
          scannedCopyUrl: true,
          office: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });
}

export async function countPendingDeliveries(officeId: string): Promise<number> {
  return prisma.documentDelivery.count({ where: { toOfficeId: officeId, status: "PENDING" } });
}
