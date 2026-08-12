import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { officeTracksDtr, parseMonthParam } from "@/lib/dtr";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const createSchema = z.object({
  // "2026-07" — the month the DTR covers, not a date. Validated into the 1st at
  // UTC midnight so the unique constraint sees one value per month.
  periodMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be YYYY-MM"),
  dateReceived: z.string().optional(),
  dateFiled: z.string().optional(),
  dateSubmittedToHr: z.string().optional(),
  personnelId: z.string(),
  submittedAndChecked: z.boolean().optional(),
});

// GET /api/dtr?month=YYYY-MM — list DTR records for the logged-in user's
// office, optionally narrowed to one period.
export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // The module itself is per-office (Office.tracksDtr). Checked in every
  // handler, not only in the pages: hiding the nav entry does not stop a
  // signed-in user at another division calling this route directly.
  if (!(await officeTracksDtr(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const month = parseMonthParam(req.nextUrl.searchParams.get("month") ?? undefined);

  const records = await prisma.dtrRecord.findMany({
    where: { officeId: session.user.officeId, ...(month ? { periodMonth: month } : {}) },
    orderBy: [{ periodMonth: "desc" }, { personnel: { name: "asc" } }],
    include: { personnel: { select: { id: true, name: true } } },
  });

  return NextResponse.json(records);
}

// POST /api/dtr — record one person's DTR filing for one month
export async function POST(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksDtr(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Same office-scoping rule as every other module: an id from the client must
  // point at a row this office can actually see.
  const personnel = await prisma.user.findFirst({
    where: { id: parsed.data.personnelId, officeId: session.user.officeId },
  });
  if (!personnel) {
    return NextResponse.json({ error: "Invalid personnelId" }, { status: 400 });
  }

  const { periodMonth, dateReceived, dateFiled, dateSubmittedToHr, ...rest } = parsed.data;

  let record;
  try {
    record = await prisma.dtrRecord.create({
      data: {
        ...rest,
        officeId: session.user.officeId,
        periodMonth: parseMonthParam(periodMonth)!,
        dateReceived: dateReceived ? new Date(dateReceived) : null,
        dateFiled: dateFiled ? new Date(dateFiled) : null,
        dateSubmittedToHr: dateSubmittedToHr ? new Date(dateSubmittedToHr) : null,
      },
    });
  } catch (e) {
    // One DTR per person per month. Reported plainly rather than as a raw
    // constraint error, because two clerks entering the same batch is the
    // ordinary way to hit this, not a bug.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: `${personnel.name} already has a DTR recorded for that month` },
        { status: 409 },
      );
    }
    throw e;
  }

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "CREATE",
    entityType: "DtrRecord",
    entityId: record.id,
    details: parsed.data,
  });

  return NextResponse.json(record, { status: 201 });
}
