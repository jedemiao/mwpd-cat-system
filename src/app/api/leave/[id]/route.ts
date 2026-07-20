import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { canDelete } from "@/lib/authz";
import { z } from "zod";

const updateSchema = z.object({
  dateFiled: z.string().nullable().optional(),
  leaveStart: z.string().optional(),
  leaveEnd: z.string().nullable().optional(),
  type: z.enum(["CTO", "VACATION", "SICK", "EMERGENCY", "OTHER"]).optional(),
  personnelId: z.string().optional(),
  scannedCopyUrl: z.string().nullable().optional(),
});

// PATCH /api/leave/[id] — update a leave record
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const existing = await prisma.leave.findFirst({
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

  if (parsed.data.personnelId) {
    const personnel = await prisma.user.findFirst({
      where: { id: parsed.data.personnelId, officeId: session.user.officeId },
    });
    if (!personnel) {
      return NextResponse.json({ error: "Invalid personnelId" }, { status: 400 });
    }
  }

  const { dateFiled, leaveStart, leaveEnd, ...rest } = parsed.data;

  const leave = await prisma.leave.update({
    where: { id: existing.id },
    data: {
      ...rest,
      dateFiled: dateFiled === undefined ? undefined : dateFiled ? new Date(dateFiled) : null,
      leaveStart: leaveStart ? new Date(leaveStart) : undefined,
      leaveEnd: leaveEnd === undefined ? undefined : leaveEnd ? new Date(leaveEnd) : null,
    },
  });

  await logAudit({
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "Leave",
    entityId: leave.id,
    details: parsed.data,
  });

  return NextResponse.json(leave);
}

// DELETE /api/leave/[id] — reserved for Division Chief / Admin
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!canDelete(session.user.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const existing = await prisma.leave.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.leave.delete({ where: { id: existing.id } });

  await logAudit({
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "DELETE",
    entityType: "Leave",
    entityId: existing.id,
    details: existing,
  });

  return NextResponse.json({ success: true });
}
