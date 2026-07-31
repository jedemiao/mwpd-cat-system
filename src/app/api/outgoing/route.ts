import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { buildOutgoingRoutingNumber, DOCUMENT_TYPE_CODE_VALUES } from "@/lib/documentTypeCodes";
import { z } from "zod";

const createSchema = z.object({
  dateReleased: z.string(), // ISO date string from the client
  documentType: z.enum(DOCUMENT_TYPE_CODE_VALUES),
  documentTitle: z.string(),
  instructions: z.string().optional(),
  receivedBy: z.string().optional(),
  relatedIncomingId: z.string().optional(),
});

// GET /api/outgoing — list documents for the logged-in user's office, newest first
export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const docs = await prisma.outgoingDocument.findMany({
    where: { officeId: session.user.officeId },
    orderBy: { dateReleased: "desc" },
    include: { relatedIncoming: { select: { routingNumber: true, documentTitle: true } } },
  });

  return NextResponse.json(docs);
}

// POST /api/outgoing — create a new dispatch record, optionally linked to the
// incoming request it answers via relatedIncomingId
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

  if (parsed.data.relatedIncomingId) {
    const relatedIncoming = await prisma.incomingDocument.findFirst({
      where: { id: parsed.data.relatedIncomingId, officeId: session.user.officeId },
    });
    if (!relatedIncoming) {
      return NextResponse.json({ error: "Invalid relatedIncomingId" }, { status: 400 });
    }
  }

  const { dateReleased, documentType, ...rest } = parsed.data;
  const releasedDate = new Date(dateReleased);

  // Atomically claim the next sequence number and create the record
  // together, so two simultaneous dispatches can't collide on a number.
  const doc = await prisma.$transaction(async (tx) => {
    const office = await tx.office.update({
      where: { id: session.user.officeId },
      data: { outgoingSeqCounter: { increment: 1 } },
      select: { outgoingSeqCounter: true, code: true },
    });
    const officePrefix = office.code.split("-")[0];

    return tx.outgoingDocument.create({
      data: {
        ...rest,
        officeId: session.user.officeId,
        routingNumber: buildOutgoingRoutingNumber(releasedDate, officePrefix, documentType, office.outgoingSeqCounter),
        dateReleased: releasedDate,
      },
    });
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "CREATE",
    entityType: "OutgoingDocument",
    entityId: doc.id,
    details: parsed.data,
  });

  return NextResponse.json(doc, { status: 201 });
}
