import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { canDelete } from "@/lib/authz";
import { z } from "zod";

const updateSchema = z.object({
  dateReleased: z.string().optional(),
  routingNumber: z.string().optional(),
  documentTitle: z.string().optional(),
  documentType: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
  // Receipt acknowledgement is normally filled in here rather than at creation:
  // the document is logged when it leaves, and comes back signed for later.
  // Optional so a PATCH that touches other fields need not resend it, but not
  // nullable: an edit may change which offices a document is addressed to and
  // must not be able to leave it addressed to none.
  receivingOffice: z.string().trim().min(1, "Choose at least one office for this document.").optional(),
  receivedBy: z.string().nullable().optional(),
  receivedDate: z.string().nullable().optional(),
  receivedTime: z.string().nullable().optional(),
  relatedIncomingId: z.string().nullable().optional(),
  activityIds: z.array(z.string()).optional(),
  progressRemarks: z.string().nullable().optional(),
  scannedCopyUrl: z.string().nullable().optional(),
  filed: z.boolean().optional(),
});

// PATCH /api/outgoing/[id] — update a dispatch record
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
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

  if (parsed.data.relatedIncomingId) {
    const relatedIncoming = await prisma.incomingDocument.findFirst({
      where: { id: parsed.data.relatedIncomingId, officeId: session.user.officeId },
    });
    if (!relatedIncoming) {
      return NextResponse.json({ error: "Invalid relatedIncomingId" }, { status: 400 });
    }
  }

  const { dateReleased, receivedDate, activityIds: rawActivityIds, ...rest } = parsed.data;

  // Office-scoped, as on create.
  const activityIds = rawActivityIds ? [...new Set(rawActivityIds)] : undefined;
  if (activityIds && activityIds.length > 0) {
    const ok = await prisma.activity.count({
      where: { id: { in: activityIds }, officeId: session.user.officeId },
    });
    if (ok !== activityIds.length) {
      return NextResponse.json({ error: "Invalid activityIds" }, { status: 400 });
    }
  }

  const doc = await prisma.$transaction(async (tx) => {
    // Replace the whole link set rather than diffing it — the form always
    // submits the complete selection, and an empty array must be able to mean
    // "unlink everything". An absent key still means "leave alone".
    if (activityIds) {
      await tx.outgoingDocumentActivity.deleteMany({ where: { outgoingId: existing.id } });
    }

    return tx.outgoingDocument.update({
      where: { id: existing.id },
      data: {
        ...rest,
        dateReleased: dateReleased ? new Date(dateReleased) : undefined,
        // Distinguish the three cases: absent means "don't touch", explicit null
        // clears a receipt recorded in error, and a string sets it.
        receivedDate:
          receivedDate === undefined ? undefined : receivedDate === null || receivedDate === "" ? null : new Date(receivedDate),
        ...(activityIds ? { linkedActivities: { create: activityIds.map((activityId) => ({ activityId })) } } : {}),
      },
    });
  });

  await logAudit({
    ipAddress: getClientIp(req),
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
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
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

  // Link rows first — the FK is RESTRICT, so a linked document cannot be
  // deleted while they exist. Mirrors the incoming route's delete.
  await prisma.$transaction([
    prisma.outgoingDocumentActivity.deleteMany({ where: { outgoingId: existing.id } }),
    prisma.outgoingDocument.delete({ where: { id: existing.id } }),
  ]);

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "DELETE",
    entityType: "OutgoingDocument",
    entityId: existing.id,
    details: existing,
  });

  return NextResponse.json({ success: true });
}
