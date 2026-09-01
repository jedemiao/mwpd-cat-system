import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { officeTracksSena } from "@/lib/sena";
import { SENA_STATUSES, CONFERENCE_TIME_SLOTS } from "@/lib/senaSchedule";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { z } from "zod";

const createSchema = z.object({
  conferenceDate: z.string(),
  conferenceTime: z.enum(CONFERENCE_TIME_SLOTS),
  conferenceNumber: z.coerce.number().int().min(1).max(9).optional(),
  mediatorId: z.string(),
  complainant: z.string().trim().min(1, "Complainant is required"),
  respondent: z.string().trim().min(1, "Respondent is required"),
  status: z.enum(SENA_STATUSES).optional(),
  // Sent as a string so the decimal survives JSON without a float round-trip.
  amountSettled: z.string().trim().optional(),
  previousConferenceId: z.string().optional(),
});

// GET /api/sena — the office's conference register, newest first.
export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // The module is per-office. Checked in every handler, not only in the pages:
  // hiding the nav entry does not stop a signed-in user at another division
  // calling this route directly.
  if (!(await officeTracksSena(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const conferences = await prisma.senaConference.findMany({
    where: { officeId: session.user.officeId },
    // Time is stored 24-hour precisely so this second key needs no lookup.
    orderBy: [{ conferenceDate: "desc" }, { conferenceTime: "asc" }],
    include: { mediator: { select: { id: true, name: true } } },
  });

  return NextResponse.json(conferences);
}

// POST /api/sena — record one conference
export async function POST(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksSena(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    conferenceDate,
    mediatorId,
    amountSettled,
    previousConferenceId,
    status,
    ...rest
  } = parsed.data;

  // Same office-scoping rule as every other module: an id from the client must
  // point at a row this office can actually see.
  const mediator = await prisma.user.findFirst({
    where: { id: mediatorId, officeId: session.user.officeId },
  });
  if (!mediator) {
    return NextResponse.json({ error: "Invalid mediatorId" }, { status: 400 });
  }

  // The follow-up link is office-scoped too — otherwise a crafted id could
  // chain this office's conference onto another division's row.
  if (previousConferenceId) {
    const previous = await prisma.senaConference.findFirst({
      where: { id: previousConferenceId, officeId: session.user.officeId },
    });
    if (!previous) {
      return NextResponse.json({ error: "Invalid previousConferenceId" }, { status: 400 });
    }
  }

  const resolvedStatus = status ?? "SCHEDULED";

  const conference = await prisma.senaConference.create({
    data: {
      ...rest,
      officeId: session.user.officeId,
      conferenceDate: new Date(conferenceDate),
      mediatorId,
      status: resolvedStatus,
      previousConferenceId: previousConferenceId || null,
      // The amount belongs to a settlement alone — a conference that was
      // withdrawn or is still scheduled must not carry a figure, whatever the
      // form last had in the box before the status was changed.
      amountSettled: resolvedStatus === "SETTLED" && amountSettled ? amountSettled : null,
    },
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "CREATE",
    entityType: "SenaConference",
    entityId: conference.id,
    details: parsed.data,
  });

  return NextResponse.json(conference, { status: 201 });
}
