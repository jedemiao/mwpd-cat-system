import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeDueDate } from "@/lib/artaLeadTime";
import { logAudit } from "@/lib/auditLog";
import { publishToUser } from "@/lib/notifyBus";
import { canDelete, canSignOffAsChief } from "@/lib/authz";
import { z } from "zod";

const updateSchema = z.object({
  dateReceived: z.string().optional(),
  routingNumber: z.string().optional(),
  documentTitle: z.string().optional(),
  routedToId: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
  complexity: z.enum(["SIMPLE", "COMPLEX", "HIGHLY_TECHNICAL"]).optional(),
  numCorrections: z.number().int().min(0).optional(),
  progressRemarks: z.string().nullable().optional(),
  dateCompleted: z.string().nullable().optional(),
  dcSignOffDate: z.string().nullable().optional(),
  scannedCopyUrl: z.string().nullable().optional(),
  filed: z.boolean().optional(),
});

const leadDaysMap = { SIMPLE: 3, COMPLEX: 7, HIGHLY_TECHNICAL: 20 } as const;

// PATCH /api/incoming/[id] — update an intake record; due date is
// recomputed if dateReceived or complexity changes. Only the Division Chief
// (or an Admin) may set dcSignOffDate.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const existing = await prisma.incomingDocument.findFirst({
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

  if ("dcSignOffDate" in body && !canSignOffAsChief(session.user.role)) {
    return NextResponse.json({ error: "Only the Division Chief can sign off" }, { status: 403 });
  }

  if (parsed.data.routedToId) {
    const routedTo = await prisma.user.findFirst({
      where: { id: parsed.data.routedToId, officeId: session.user.officeId },
    });
    if (!routedTo) {
      return NextResponse.json({ error: "Invalid routedToId" }, { status: 400 });
    }
  }

  const { dateReceived, dateCompleted, dcSignOffDate, complexity, ...rest } = parsed.data;

  const nextDateReceived = dateReceived ? new Date(dateReceived) : existing.dateReceived;
  const nextComplexity = complexity ?? existing.complexity;
  const dueDate = computeDueDate(nextDateReceived, nextComplexity);

  const doc = await prisma.incomingDocument.update({
    where: { id: existing.id },
    data: {
      ...rest,
      dateReceived: nextDateReceived,
      complexity: nextComplexity,
      leadTimeDays: leadDaysMap[nextComplexity],
      dueDate,
      dateCompleted: dateCompleted === undefined ? undefined : dateCompleted ? new Date(dateCompleted) : null,
      dcSignOffDate: dcSignOffDate === undefined ? undefined : dcSignOffDate ? new Date(dcSignOffDate) : null,
    },
  });

  await logAudit({
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "IncomingDocument",
    entityId: doc.id,
    details: parsed.data,
  });

  // Newly routed (assigned on this update, to someone other than the actor) — live notify them.
  if (doc.routedToId && doc.routedToId !== existing.routedToId && doc.routedToId !== session.user.id) {
    publishToUser(doc.routedToId, {
      type: "incoming-routed",
      documentId: doc.id,
      routingNumber: doc.routingNumber,
      documentTitle: doc.documentTitle,
    });
  }
  // Reassigned away from / unassigned from the previous person — refresh their queue.
  if (existing.routedToId && existing.routedToId !== doc.routedToId) {
    publishToUser(existing.routedToId, { type: "incoming-unrouted", documentId: doc.id });
  }
  // Marked complete while routed to someone — drop it off their live queue.
  if (doc.routedToId && !existing.dateCompleted && doc.dateCompleted) {
    publishToUser(doc.routedToId, { type: "incoming-completed", documentId: doc.id });
  }

  return NextResponse.json(doc);
}

// DELETE /api/incoming/[id] — reserved for Division Chief / Admin, since
// removing a compliance record shouldn't be a routine data-entry action
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!canDelete(session.user.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const existing = await prisma.incomingDocument.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.incomingDocument.delete({ where: { id: existing.id } });

  await logAudit({
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "DELETE",
    entityType: "IncomingDocument",
    entityId: existing.id,
    details: existing,
  });

  return NextResponse.json({ success: true });
}
