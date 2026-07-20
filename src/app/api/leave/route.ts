import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { z } from "zod";

const createSchema = z.object({
  dateFiled: z.string().optional(),
  leaveStart: z.string(), // ISO date string from the client
  leaveEnd: z.string().optional(),
  type: z.enum(["CTO", "VACATION", "SICK", "EMERGENCY", "OTHER"]).default("OTHER"),
  personnelId: z.string(),
  scannedCopyUrl: z.string().optional(),
});

// GET /api/leave?from=...&to=... — list leave records for the logged-in user's
// office, optionally filtered to those overlapping a date range (used by the
// Activities workflow to check staff availability before assigning fieldwork)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const leaves = await prisma.leave.findMany({
    where: {
      officeId: session.user.officeId,
      ...(to ? { leaveStart: { lte: new Date(to) } } : {}),
      ...(from
        ? { OR: [{ leaveEnd: { gte: new Date(from) } }, { leaveEnd: null, leaveStart: { gte: new Date(from) } }] }
        : {}),
    },
    orderBy: { leaveStart: "desc" },
    include: { personnel: { select: { name: true } } },
  });

  return NextResponse.json(leaves);
}

// POST /api/leave — file a new leave record
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const personnel = await prisma.user.findFirst({
    where: { id: parsed.data.personnelId, officeId: session.user.officeId },
  });
  if (!personnel) {
    return NextResponse.json({ error: "Invalid personnelId" }, { status: 400 });
  }

  const { dateFiled, leaveStart, leaveEnd, ...rest } = parsed.data;

  const leave = await prisma.leave.create({
    data: {
      ...rest,
      officeId: session.user.officeId,
      dateFiled: dateFiled ? new Date(dateFiled) : undefined,
      leaveStart: new Date(leaveStart),
      leaveEnd: leaveEnd ? new Date(leaveEnd) : undefined,
    },
  });

  await logAudit({
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "CREATE",
    entityType: "Leave",
    entityId: leave.id,
    details: parsed.data,
  });

  return NextResponse.json(leave, { status: 201 });
}
