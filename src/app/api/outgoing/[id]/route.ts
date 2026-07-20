import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { canDelete } from "@/lib/authz";
import { z } from "zod";

const updateSchema = z.object({
  dateReleased: z.string().optional(),
  routingNumber: z.string().optional(),
  documentTitle: z.string().optional(),
  instructions: z.string().nullable().optional(),
  authorizedBy: z.string().nullable().optional(),
  receivedBy: z.string().nullable().optional(),
  relatedIncomingId: z.string().nullable().optional(),
  progressRemarks: z.string().nullable().optional(),
  scannedCopyUrl: z.string().nullable().optional(),
  filed: z.boolean().optional(),
});

// PATCH /api/outgoing/[id] — update a dispatch record
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const existing = await prisma.outgoingDocument.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { dateReleased, ...rest } = parsed.data;

  const doc = await prisma.outgoingDocument.update({
    where: { id: existing.id },
    data: {
      ...rest,
      dateReleased: dateReleased ? new Date(dateReleased) : undefined,
    },
  });

  await logAudit({
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "OutgoingDocument",
    entityId: doc.id,
    details: parsed.data,
  });

  return NextResponse.json(doc);
}

// DELETE /api/outgoing/[id] — reserved for Division Chief / Admin
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!canDelete(session.user.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const existing = await prisma.outgoingDocument.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.outgoingDocument.delete({ where: { id: existing.id } });

  await logAudit({
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "DELETE",
    entityType: "OutgoingDocument",
    entityId: existing.id,
    details: existing,
  });

  return NextResponse.json({ success: true });
}
