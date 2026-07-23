import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "READ";

// Records an accountability trail entry. Called after every mutation on the
// four tracked ledgers (plus file reads/downloads) so there's a transparent
// history of who did what, and from where.
export async function logAudit(params: {
  officeId: string;
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  ipAddress?: string | null;
  details?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      ipAddress: params.ipAddress ?? undefined,
      details: params.details === undefined ? undefined : JSON.parse(JSON.stringify(params.details)),
    },
  });
}

// nginx (see nginx.conf) sets both of these; X-Real-IP is the direct proxy
// hop and takes precedence, X-Forwarded-For is a fallback for setups where
// only that header is forwarded. req.ip is unset in the Next.js standalone
// server, since it doesn't run behind Vercel's edge network.
export function getClientIp(req: NextRequest): string | null {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();

  return null;
}
