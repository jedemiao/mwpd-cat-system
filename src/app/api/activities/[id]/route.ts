import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { canDelete } from "@/lib/authz";
import { z } from "zod";

const updateSchema = z.object({
  date: z.string().optional(),
  activityName: z.string().optional(),
  remarks: z.string().nullable().optional(),
  officeOrderUrl: z.string().nullable().optional(),
  memoUrl: z.string().nullable().optional(),
  inspectionReportUrl: z.string().nullable().optional(),
  assigneeIds: z.array(z.string()).min(1).optional(),
});

// PATCH /api/activities/[id] — update an activity; assigneeIds, if given,
// replaces the full set of people in charge
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const existing = await prisma.activity.findFirst({
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

  const { date, assigneeIds, ...rest } = parsed.data;

  if (assigneeIds) {
    const uniqueAssigneeIds = [...new Set(assigneeIds)];
    const validAssignees = await prisma.user.count({
      where: { id: { in: uniqueAssigneeIds }, officeId: session.user.officeId },
    });
    if (validAssignees !== uniqueAssigneeIds.length) {
      return NextResponse.json({ error: "Invalid assigneeIds" }, { status: 400 });
    }
  }

  const activity = await prisma.$transaction(async (tx) => {
    if (assigneeIds) {
      await tx.activityAssignee.deleteMany({ where: { activityId: existing.id } });
    }

    return tx.activity.update({
      where: { id: existing.id },
      data: {
        ...rest,
        date: date ? new Date(date) : undefined,
        ...(assigneeIds ? { assignees: { create: assigneeIds.map((userId) => ({ userId })) } } : {}),
      },
      include: { assignees: { include: { user: { select: { name: true } } } } },
    });
  });

  await logAudit({
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "Activity",
    entityId: activity.id,
    details: parsed.data,
  });

  return NextResponse.json(activity);
}

// DELETE /api/activities/[id] — reserved for Division Chief / Admin
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!canDelete(session.user.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const existing = await prisma.activity.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.activityAssignee.deleteMany({ where: { activityId: existing.id } }),
    prisma.activity.delete({ where: { id: existing.id } }),
  ]);

  await logAudit({
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "DELETE",
    entityType: "Activity",
    entityId: existing.id,
    details: existing,
  });

  return NextResponse.json({ success: true });
}
