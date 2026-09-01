import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { officeTracksCallLog } from "@/lib/sena";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { canDelete } from "@/lib/authz";
import { z } from "zod";

const updateSchema = z.object({
  callDate: z.string().optional(),
  phoneNumber: z.string().trim().min(1).optional(),
  callerName: z.string().trim().min(1).optional(),
  concern: z.string().trim().min(1).optional(),
  remarks: z.string().trim().nullable().optional(),
});

// PATCH /api/call-log/[id] — correct one logged call
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksCallLog(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await prisma.callLog.findFirst({
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

  const { callDate, remarks, ...rest } = parsed.data;

  const call = await prisma.callLog.update({
    where: { id: existing.id },
    data: {
      ...rest,
      ...(callDate ? { callDate: new Date(callDate) } : {}),
      ...(remarks === undefined ? {} : { remarks: remarks || null }),
    },
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "CallLog",
    entityId: call.id,
    details: parsed.data,
  });

  return NextResponse.json(call);
}

// DELETE /api/call-log/[id] — Division Chief / Admin only
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksCallLog(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canDelete(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.callLog.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.callLog.delete({ where: { id: existing.id } });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "DELETE",
    entityType: "CallLog",
    entityId: existing.id,
    details: existing,
  });

  return NextResponse.json({ ok: true });
}
