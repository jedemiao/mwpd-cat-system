import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
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
});

// GET /api/internal — list internal memos for the logged-in user's office, newest first
export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
