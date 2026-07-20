import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { z } from "zod";

const createSchema = z.object({
  dateReleased: z.string(), // ISO date string from the client
  routingNumber: z.string(),
  documentTitle: z.string(),
  instructions: z.string().optional(),
  authorizedBy: z.string().optional(),
  receivedBy: z.string().optional(),
  relatedIncomingId: z.string().optional(),
});

// GET /api/outgoing — list documents for the logged-in user's office, newest first
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
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
  const session = await getServerSession(authOptions);
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

  const { dateReleased, ...rest } = parsed.data;

  const doc = await prisma.outgoingDocument.create({
    data: {
      ...rest,
      officeId: session.user.officeId,
      dateReleased: new Date(dateReleased),
    },
  });

  await logAudit({
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "CREATE",
    entityType: "OutgoingDocument",
    entityId: doc.id,
    details: parsed.data,
  });

  return NextResponse.json(doc, { status: 201 });
}
