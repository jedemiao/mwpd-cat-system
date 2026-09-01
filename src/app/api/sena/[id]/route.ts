import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { officeTracksSena } from "@/lib/sena";
import { SENA_STATUSES, CONFERENCE_TIME_SLOTS } from "@/lib/senaSchedule";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { canDelete } from "@/lib/authz";
import { z } from "zod";

const updateSchema = z.object({
  conferenceDate: z.string().optional(),
  conferenceTime: z.enum(CONFERENCE_TIME_SLOTS).optional(),
  conferenceNumber: z.coerce.number().int().min(1).max(9).optional(),
  mediatorId: z.string().optional(),
  complainant: z.string().trim().min(1).optional(),
  respondent: z.string().trim().min(1).optional(),
  status: z.enum(SENA_STATUSES).optional(),
  amountSettled: z.string().trim().nullable().optional(),
  previousConferenceId: z.string().nullable().optional(),
});

// PATCH /api/sena/[id] — update one conference
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksSena(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await prisma.senaConference.findFirst({
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

  if (parsed.data.mediatorId) {
    const mediator = await prisma.user.findFirst({
      where: { id: parsed.data.mediatorId, officeId: session.user.officeId },
    });
    if (!mediator) {
      return NextResponse.json({ error: "Invalid mediatorId" }, { status: 400 });
    }
  }

  if (parsed.data.previousConferenceId) {
    // A conference cannot follow itself — that would make the case history a
    // loop, and the register page walks the chain to show it.
    if (parsed.data.previousConferenceId === existing.id) {
      return NextResponse.json(
        { error: "A conference cannot be its own follow-up" },
        { status: 400 },
      );
    }
    const previous = await prisma.senaConference.findFirst({
      where: { id: parsed.data.previousConferenceId, officeId: session.user.officeId },
    });
    if (!previous) {
      return NextResponse.json({ error: "Invalid previousConferenceId" }, { status: 400 });
    }
  }

  const { conferenceDate, amountSettled, previousConferenceId, ...rest } = parsed.data;

  // The amount follows the status, whichever of the two this request changed:
  // moving a settled conference to withdrawn has to clear the figure, or the
  // register would report money against a case that never settled.
  const nextStatus = parsed.data.status ?? existing.status;
  const nextAmount =
    nextStatus === "SETTLED"
      ? amountSettled === undefined
        ? existing.amountSettled
        : amountSettled || null
      : null;

  const conference = await prisma.senaConference.update({
    where: { id: existing.id },
    data: {
      ...rest,
      ...(conferenceDate ? { conferenceDate: new Date(conferenceDate) } : {}),
      ...(previousConferenceId === undefined
        ? {}
        : { previousConferenceId: previousConferenceId || null }),
      amountSettled: nextAmount,
    },
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "SenaConference",
    entityId: conference.id,
    details: parsed.data,
  });

  return NextResponse.json(conference);
}

// DELETE /api/sena/[id] — Division Chief / Admin only, as every module's delete is
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksSena(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canDelete(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.senaConference.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Anything filed as a follow-up to this one is detached rather than deleted:
  // a later conference is its own record of a real meeting, and removing the
  // first one must not take the second's history with it. The FK is ON DELETE
  // SET NULL, but doing it explicitly keeps the audit entry honest.
  await prisma.senaConference.updateMany({
    where: { previousConferenceId: existing.id, officeId: session.user.officeId },
    data: { previousConferenceId: null },
  });

  await prisma.senaConference.delete({ where: { id: existing.id } });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "DELETE",
    entityType: "SenaConference",
    entityId: existing.id,
    details: existing,
  });

  return NextResponse.json({ ok: true });
}
