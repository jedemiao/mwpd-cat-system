import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { officeTracksInternalMemos } from "@/lib/internalMemos";
import { prisma } from "@/lib/prisma";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const createSchema = z.object({
  dateReleased: z.string(), // ISO date string from the client
  memorandumNumber: z.number().int(),
  documentTitle: z.string(),
  instructions: z.string().optional(),
  receivedBy: z.string().optional(),
  // The register is one row filled in over time, and a memo is often logged
  // after it has already gone out and been acknowledged — every row of the
  // office's own sheet carries remarks, a scan and FILED=YES. So the later
  // columns are accepted on create rather than only on edit; without them Zod
  // strips the values and the first save silently loses what was typed.
  progressRemarks: z.string().optional(),
  scannedCopyUrl: z.string().optional(),
  filed: z.boolean().optional(),
});

// GET /api/internal — list internal memos for the logged-in user's office, newest first
export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // The module itself is per-office (Office.tracksInternalMemos). Checked in
  // every handler, not only in the pages: hiding the nav entry does not stop a
  // signed-in user at another division calling this route directly.
  if (!(await officeTracksInternalMemos(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const memos = await prisma.internalMemo.findMany({
    where: { officeId: session.user.officeId },
    orderBy: { dateReleased: "desc" },
  });

  return NextResponse.json(memos);
}

// POST /api/internal — create a new internal memo record
export async function POST(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksInternalMemos(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { dateReleased, ...rest } = parsed.data;

  let memo;
  try {
    memo = await prisma.internalMemo.create({
      data: {
        ...rest,
        officeId: session.user.officeId,
        dateReleased: new Date(dateReleased),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "That memorandum number is already in use" }, { status: 409 });
    }
    throw e;
  }

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "CREATE",
    entityType: "InternalMemo",
    entityId: memo.id,
    details: parsed.data,
  });

  return NextResponse.json(memo, { status: 201 });
}
