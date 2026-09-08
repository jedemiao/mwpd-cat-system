import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { computeDueDate } from "@/lib/artaLeadTime";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { publishToUser } from "@/lib/notifyBus";
import { canDelete, canSignOffAsChief } from "@/lib/authz";
import { z } from "zod";

const updateSchema = z.object({
  dateReceived: z.string().optional(),
  timeReceived: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM")
    .nullable()
    .optional()
    .or(z.literal("")),
  routingNumber: z.string().optional(),
  documentType: z.string().nullable().optional(),
  documentTypeOther: z.string().nullable().optional(),
  documentTitle: z.string().optional(),
  // See the create route: an explicit due date overrides the ARTA calculation,
  // and is only ever sent by the register layout's Division Chief field.
  dueDate: z.string().nullable().optional(),
  origin: z.enum(["INTERNAL", "EXTERNAL"]).optional(),
  receivedById: z.string().nullable().optional().or(z.literal("")),
  originAgency: z.string().nullable().optional(),
  signatory: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  activityIds: z.array(z.string()).optional(),
  routedToIds: z.array(z.string()).optional(),
  instructions: z.string().nullable().optional(),
  complexity: z.enum(["SIMPLE", "COMPLEX", "HIGHLY_TECHNICAL"]).optional(),
  progressRemarks: z.string().nullable().optional(),
  dateCompleted: z.string().nullable().optional(),
  dcSignOffDate: z.string().nullable().optional(),
  scannedCopyUrl: z.string().nullable().optional(),
  filed: z.boolean().optional(),
});

const leadDaysMap = { SIMPLE: 3, COMPLEX: 7, HIGHLY_TECHNICAL: 20 } as const;

// The DC column — see src/lib/authz.ts. Routine record-keeping (date
// received, routing number, title, progress remarks, scanned copy, filed)
// stays open to whoever holds the record.
const CHIEF_ONLY_FIELDS = ["routedToIds", "instructions", "complexity", "dateCompleted", "dcSignOffDate", "dueDate"] as const;

// PATCH /api/incoming/[id] — update an intake record; due date is
// recomputed if dateReceived or complexity changes. Only the Division Chief
// (or an Admin) may edit the DC column fields, including dcSignOffDate.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const existing = await prisma.incomingDocument.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
    include: { routedTo: { select: { userId: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (CHIEF_ONLY_FIELDS.some((f) => f in body) && !canSignOffAsChief(session.user.role)) {
    return NextResponse.json({ error: "Only the Division Chief can edit this section" }, { status: 403 });
  }

  const routedToIds = parsed.data.routedToIds ? [...new Set(parsed.data.routedToIds)] : undefined;
  if (routedToIds && routedToIds.length > 0) {
    const validRoutedTo = await prisma.user.count({
      where: { id: { in: routedToIds }, officeId: session.user.officeId },
    });
    if (validRoutedTo !== routedToIds.length) {
      return NextResponse.json({ error: "Invalid routedToIds" }, { status: 400 });
    }
  }

  // Same office-scoping rule as the create route: ids from the client must
  // point at rows this office can actually see.
  if (parsed.data.receivedById) {
    const ok = await prisma.user.count({
      where: { id: parsed.data.receivedById, officeId: session.user.officeId },
    });
    if (ok !== 1) return NextResponse.json({ error: "Invalid receivedById" }, { status: 400 });
  }
  const activityIds = parsed.data.activityIds ? [...new Set(parsed.data.activityIds)] : undefined;
  if (activityIds && activityIds.length > 0) {
    const ok = await prisma.activity.count({
      where: { id: { in: activityIds }, officeId: session.user.officeId },
    });
    if (ok !== activityIds.length) {
      return NextResponse.json({ error: "Invalid activityIds" }, { status: 400 });
    }
  }

  const {
    dateReceived,
    timeReceived,
    receivedById,
    dateCompleted,
    dcSignOffDate,
    complexity,
    dueDate: dueDateOverride,
    routedToIds: _routedToIds,
    activityIds: _activityIds,
    ...rest
  } = parsed.data;

  const nextDateReceived = dateReceived ? new Date(dateReceived) : existing.dateReceived;
  const nextComplexity = complexity ?? existing.complexity;
  // An explicit due date wins; clearing it (null) falls back to the ARTA
  // calculation rather than leaving the document with no due date at all, since
  // an ARTA-tracked document without one would drop off the compliance board.
  const overrideDate = dueDateOverride ? new Date(dueDateOverride) : null;
  const dueDate =
    overrideDate && !Number.isNaN(overrideDate.getTime())
      ? overrideDate
      : computeDueDate(nextDateReceived, nextComplexity);

  const doc = await prisma.$transaction(async (tx) => {
    if (routedToIds) {
      await tx.incomingRoutedStaff.deleteMany({ where: { incomingId: existing.id } });
    }
    // Replace the whole link set rather than diffing it — the form always
    // submits the complete selection, and an empty array must be able to mean
    // "unlink everything".
    if (activityIds) {
      await tx.incomingDocumentActivity.deleteMany({ where: { incomingId: existing.id } });
    }

    return tx.incomingDocument.update({
      where: { id: existing.id },
      data: {
        ...rest,
        dateReceived: nextDateReceived,
        // "" from a cleared input means null, but an absent key means "leave alone".
        timeReceived: timeReceived === undefined ? undefined : timeReceived || null,
        receivedById: receivedById === undefined ? undefined : receivedById || null,
        complexity: nextComplexity,
        leadTimeDays: leadDaysMap[nextComplexity],
        dueDate,
        dateCompleted: dateCompleted === undefined ? undefined : dateCompleted ? new Date(dateCompleted) : null,
        dcSignOffDate: dcSignOffDate === undefined ? undefined : dcSignOffDate ? new Date(dcSignOffDate) : null,
        ...(routedToIds ? { routedTo: { create: routedToIds.map((userId) => ({ userId })) } } : {}),
        ...(activityIds ? { linkedActivities: { create: activityIds.map((activityId) => ({ activityId })) } } : {}),
      },
    });
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "IncomingDocument",
    entityId: doc.id,
    details: parsed.data,
  });

  if (routedToIds) {
    const existingIds = new Set(existing.routedTo.map((r) => r.userId));
    const nextIds = new Set(routedToIds);

    // Newly routed (assigned on this update, to someone other than the actor) — live notify them.
    for (const userId of routedToIds) {
      if (existingIds.has(userId) || userId === session.user.id) continue;
      publishToUser(userId, {
        type: "incoming-routed",
        documentId: doc.id,
        routingNumber: doc.routingNumber,
        documentTitle: doc.documentTitle,
      });
    }
    // Reassigned away from / unassigned from the previous person(s) — refresh their queue.
    for (const userId of existingIds) {
      if (!nextIds.has(userId)) {
        publishToUser(userId, { type: "incoming-unrouted", documentId: doc.id });
      }
    }
  }
  // Marked complete while routed to someone — drop it off their live queue.
  if (!existing.dateCompleted && doc.dateCompleted) {
    const notifyIds = routedToIds ?? existing.routedTo.map((r) => r.userId);
    for (const userId of notifyIds) {
      publishToUser(userId, { type: "incoming-completed", documentId: doc.id });
    }
  }

  return NextResponse.json(doc);
}

// DELETE /api/incoming/[id] — reserved for Division Chief / Admin, since
// removing a compliance record shouldn't be a routine data-entry action
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!canDelete(session.user.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const existing = await prisma.incomingDocument.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
    include: { _count: { select: { outgoingReplies: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // A document that has been answered cannot be deleted.
  //
  // OutgoingDocument.relatedIncomingId is an optional relation, so Postgres
  // does not refuse this delete — it sets the column to null and the delete
  // succeeds. The reply then survives with nothing to answer: it shows on the
  // work board as "Originated here", carries a routing number inherited from a
  // document that no longer exists, and can never be released, because
  // releasing closes an incoming record that is gone. Nobody is told any of
  // this happened.
  //
  // Refusing is the right answer rather than cascading. The reply is a real
  // dispatch record — possibly one already released and signed for — and
  // erasing it to tidy up the ledger is exactly the kind of thing a records
  // system must not do quietly. Delete the reply first if that is really the
  // intention; that is a separate, visible decision.
  if (existing._count.outgoingReplies > 0) {
    return NextResponse.json(
      {
        error:
          "This document has a reply and cannot be deleted. Delete the reply from the Outgoing work board first.",
      },
      { status: 409 },
    );
  }

  // Both join tables use ON DELETE RESTRICT, so their rows have to go first or
  // the delete fails on a foreign key.
  await prisma.$transaction([
    prisma.incomingRoutedStaff.deleteMany({ where: { incomingId: existing.id } }),
    prisma.incomingDocumentActivity.deleteMany({ where: { incomingId: existing.id } }),
    prisma.incomingDocument.delete({ where: { id: existing.id } }),
  ]);

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "DELETE",
    entityType: "IncomingDocument",
    entityId: existing.id,
    details: existing,
  });

  return NextResponse.json({ success: true });
}
