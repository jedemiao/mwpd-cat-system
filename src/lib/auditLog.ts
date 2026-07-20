import { prisma } from "@/lib/prisma";

type AuditAction = "CREATE" | "UPDATE" | "DELETE";

// Records an accountability trail entry. Called after every mutation on the
// four tracked ledgers so there's a transparent history of who changed what.
export async function logAudit(params: {
  officeId: string;
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  details?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      details: params.details === undefined ? undefined : JSON.parse(JSON.stringify(params.details)),
    },
  });
}
