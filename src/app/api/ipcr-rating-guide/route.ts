import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { officeTracksIpcrRatingGuide, usedDescriptors } from "@/lib/ipcrRatingGuide";
import { isSemester } from "@/lib/dipcr";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { z } from "zod";

// A dimension's five descriptors. Every level is optional because the sheet
// leaves cells blank wherever a level needs no separate wording — "Not
// developed" covers both 2 and 1 on several rows.
const descriptorSchema = z.object({
  dimension: z.enum(["QUALITY", "EFFICIENCY", "TIMELINESS"]),
  level5: z.string().nullable().optional(),
  level4: z.string().nullable().optional(),
  level3: z.string().nullable().optional(),
  level2: z.string().nullable().optional(),
  level1: z.string().nullable().optional(),
});

const createSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  semester: z.enum(["FIRST", "SECOND"]),
  section: z.string().trim().min(1),
  pap: z.string().trim().min(1),
  successIndicator: z.string().trim().min(1),
  meansOfVerification: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  accountableIds: z.array(z.string()).optional(),
  // Arrives as the complete set for the row, the same way the D/IPCR's
  // accomplishments do: the form always submits every dimension it shows, so an
  // omitted one means "not rated on this", not "unchanged".
  descriptors: z.array(descriptorSchema).optional(),
});

// GET /api/ipcr-rating-guide?year=2026&semester=SECOND
export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // The module itself is per-office. Checked in every handler, not only in the
  // pages — an office without it must not be able to read or write these rows
  // by calling the route directly.
  if (!(await officeTracksIpcrRatingGuide(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const yearParam = req.nextUrl.searchParams.get("year");
  const semesterParam = req.nextUrl.searchParams.get("semester") ?? "";
  const year = yearParam && /^\d{4}$/.test(yearParam) ? parseInt(yearParam, 10) : undefined;

  const rows = await prisma.ipcrRatingGuideRow.findMany({
    where: {
      officeId: session.user.officeId,
      ...(year ? { year } : {}),
      ...(isSemester(semesterParam) ? { semester: semesterParam } : {}),
    },
    orderBy: [{ year: "desc" }, { section: "asc" }, { pap: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      accountable: { include: { user: { select: { id: true, name: true } } } },
      ratings: true,
    },
  });

  return NextResponse.json(rows);
}

// POST /api/ipcr-rating-guide — add one indicator and its rating scale
export async function POST(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksIpcrRatingGuide(session.user.officeId))) {
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

  const descriptors = usedDescriptors(parsed.data.descriptors ?? []);
  // A dimension repeated in one payload would trip the unique index as an
  // opaque 500, so it is refused here with something a person can act on.
  const dimensions = descriptors.map((d) => d.dimension);
  if (new Set(dimensions).size !== dimensions.length) {
    return NextResponse.json({ error: "The same rating dimension was sent twice" }, { status: 400 });
  }

  const { accountableIds: _a, descriptors: _d, meansOfVerification, ...rest } = parsed.data;

  const row = await prisma.ipcrRatingGuideRow.create({
    data: {
      ...rest,
      officeId: session.user.officeId,
      meansOfVerification: meansOfVerification?.trim() || null,
      accountable: { create: accountableIds.map((userId) => ({ userId })) },
      ratings: { create: descriptors },
    },
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "CREATE",
    entityType: "IpcrRatingGuideRow",
    entityId: row.id,
    details: parsed.data,
  });

  return NextResponse.json(row, { status: 201 });
}
