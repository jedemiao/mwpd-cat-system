import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { officeTracksDtr, parseMonthParam } from "@/lib/dtr";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { canDelete } from "@/lib/authz";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const updateSchema = z.object({
  periodMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be YYYY-MM").optional(),
  dateReceived: z.string().nullable().optional(),
  dateFiled: z.string().nullable().optional(),
  dateSubmittedToHr: z.string().nullable().optional(),
  personnelId: z.string().optional(),
  submittedAndChecked: z.boolean().optional(),
});

// PATCH /api/dtr/[id] — update one DTR filing record
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // The module itself is per-office (Office.tracksDtr). Checked in every
  // handler, not only in the pages.
  if (!(await officeTracksDtr(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await prisma.dtrRecord.findFirst({
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

  const { periodMonth, dateReceived, dateFiled, dateSubmittedToHr, ...rest } = parsed.data;

  let record;
  try {
    record = await prisma.dtrRecord.update({
      where: { id: existing.id },
      data: {
        ...rest,
        periodMonth: periodMonth ? parseMonthParam(periodMonth)! : undefined,
        // Three-way, as the Leave route does it: absent leaves the stored value
        // alone, null clears it, a string sets it.
        dateReceived: dateReceived === undefined ? undefined : dateReceived ? new Date(dateReceived) : null,
        dateFiled: dateFiled === undefined ? undefined : dateFiled ? new Date(dateFiled) : null,
        dateSubmittedToHr:
          dateSubmittedToHr === undefined ? undefined : dateSubmittedToHr ? new Date(dateSubmittedToHr) : null,
      },
    });
  } catch (e) {
    // Moving a record onto a month/person that already has one.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "That person already has a DTR recorded for that month" }, { status: 409 });
    }
    throw e;
  }

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "DtrRecord",
    entityId: record.id,
    details: parsed.data,
  });

  return NextResponse.json(record);
}

// DELETE /api/dtr/[id] — reserved for Division Chief / Admin
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksDtr(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canDelete(session.user.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const existing = await prisma.dtrRecord.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.dtrRecord.delete({ where: { id: existing.id } });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "DELETE",
    entityType: "DtrRecord",
    entityId: existing.id,
    details: existing,
  });

  return NextResponse.json({ success: true });
}
