import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { officeTracksCallLog } from "@/lib/sena";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { z } from "zod";

const createSchema = z.object({
  callDate: z.string(),
  // Kept as free text, not coerced to a number: these are mobile numbers with a
  // leading zero, and anything numeric eats it.
  phoneNumber: z.string().trim().min(1, "Number is required"),
  callerName: z.string().trim().min(1, "Name is required"),
  concern: z.string().trim().min(1, "Concern is required"),
  remarks: z.string().trim().optional(),
});

// GET /api/call-log — the office's call log, newest first.
export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksCallLog(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const calls = await prisma.callLog.findMany({
    where: { officeId: session.user.officeId },
    orderBy: [{ callDate: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(calls);
}

// POST /api/call-log — log one call
export async function POST(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksCallLog(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { callDate, remarks, ...rest } = parsed.data;

  const call = await prisma.callLog.create({
    data: {
      ...rest,
      officeId: session.user.officeId,
      callDate: new Date(callDate),
      remarks: remarks || null,
    },
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "CREATE",
    entityType: "CallLog",
    entityId: call.id,
    details: parsed.data,
  });

  return NextResponse.json(call, { status: 201 });
}
