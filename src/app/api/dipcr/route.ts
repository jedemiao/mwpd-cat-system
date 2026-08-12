import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { officeTracksDipcr, isSemester } from "@/lib/dipcr";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { z } from "zod";

// Accomplishments arrive as the complete set for the row, the same way
// IncomingDocument's routedToIds does — the form always submits every cell it
// shows, so an omitted month means "cleared", not "unchanged".
const accomplishmentSchema = z.object({
  month: z.number().int().min(1).max(12),
  narrative: z.string(),
});

const createSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  semester: z.enum(["FIRST", "SECOND"]),
  section: z.string().trim().min(1),
  pap: z.string().trim().min(1),
  successIndicator: z.string().trim().min(1),
  // A money string ("247437.00"), kept as a string all the way to Prisma so it
  // never passes through a float.
  allottedBudget: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Budget must be a number with up to two decimals")
    .nullable()
    .optional(),
  remarks: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  accountableIds: z.array(z.string()).optional(),
  accomplishments: z.array(accomplishmentSchema).optional(),
});

// GET /api/dipcr?year=2026&semester=SECOND
export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // The module itself is per-office (Office.tracksDipcr). Checked in every
  // handler, not only in the pages.
  if (!(await officeTracksDipcr(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const yearParam = req.nextUrl.searchParams.get("year");
  const semesterParam = req.nextUrl.searchParams.get("semester") ?? "";
  const year = yearParam && /^\d{4}$/.test(yearParam) ? parseInt(yearParam, 10) : undefined;

  const indicators = await prisma.dipcrIndicator.findMany({
    where: {
      officeId: session.user.officeId,
      ...(year ? { year } : {}),
      ...(isSemester(semesterParam) ? { semester: semesterParam } : {}),
    },
    orderBy: [{ year: "desc" }, { section: "asc" }, { pap: "asc" }, { sortOrder: "asc" }],
    include: {
      accountable: { include: { user: { select: { id: true, name: true } } } },
      accomplishments: { orderBy: { month: "asc" } },
    },
  });

  return NextResponse.json(indicators);
}

// POST /api/dipcr — add one success indicator row
export async function POST(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksDipcr(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const accountableIds = [...new Set(parsed.data.accountableIds ?? [])];
  if (accountableIds.length > 0) {
    // Same office-scoping rule as every other module: ids from the client must
    // point at rows this office can actually see.
    const valid = await prisma.user.count({
      where: { id: { in: accountableIds }, officeId: session.user.officeId },
    });
    if (valid !== accountableIds.length) {
      return NextResponse.json({ error: "Invalid accountableIds" }, { status: 400 });
    }
  }

  // A month repeated in one payload would trip the unique constraint as an
  // opaque 500, so it is refused here with something a person can act on.
  const accomplishments = (parsed.data.accomplishments ?? []).filter((a) => a.narrative.trim() !== "");
  const months = accomplishments.map((a) => a.month);
  if (new Set(months).size !== months.length) {
    return NextResponse.json({ error: "The same month was sent twice" }, { status: 400 });
  }

  const { allottedBudget, accountableIds: _a, accomplishments: _b, ...rest } = parsed.data;

  const indicator = await prisma.dipcrIndicator.create({
    data: {
      ...rest,
      officeId: session.user.officeId,
      allottedBudget: allottedBudget ?? null,
      accountable: { create: accountableIds.map((userId) => ({ userId })) },
      accomplishments: {
        create: accomplishments.map((a) => ({ month: a.month, narrative: a.narrative.trim() })),
      },
    },
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "CREATE",
    entityType: "DipcrIndicator",
    entityId: indicator.id,
    details: parsed.data,
  });

  return NextResponse.json(indicator, { status: 201 });
}
