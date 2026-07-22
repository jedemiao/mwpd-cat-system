import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeDueDate } from "@/lib/artaLeadTime";
import { logAudit } from "@/lib/auditLog";
import { publishToUser } from "@/lib/notifyBus";
import { canSignOffAsChief } from "@/lib/authz";
import { buildRoutingNumber, DOCUMENT_TYPE_CODE_VALUES } from "@/lib/documentTypeCodes";
import { z } from "zod";

// The DC column — see src/lib/authz.ts. Routine intake (date received,
// routing number, title) is left open to whoever is creating the record.
const CHIEF_ONLY_FIELDS = ["routedToIds", "instructions", "complexity"] as const;

const createSchema = z.object({
  dateReceived: z.string(), // ISO date string from the client
  documentType: z.enum(DOCUMENT_TYPE_CODE_VALUES),
  documentTitle: z.string(),
  routedToIds: z.array(z.string()).optional(),
  instructions: z.string().optional(),
  complexity: z.enum(["SIMPLE", "COMPLEX", "HIGHLY_TECHNICAL"]).default("SIMPLE"),
});

// GET /api/incoming — list documents for the logged-in user's office, newest first
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const docs = await prisma.incomingDocument.findMany({
    where: { officeId: session.user.officeId },
    orderBy: { dateReceived: "desc" },
    include: { routedTo: { include: { user: { select: { name: true } } } } },
  });

  return NextResponse.json(docs);
}

// POST /api/incoming — create a new intake record, due date computed server-side
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

  if (CHIEF_ONLY_FIELDS.some((f) => f in body) && !canSignOffAsChief(session.user.role)) {
    return NextResponse.json({ error: "Only the Division Chief can set routing, complexity, or instructions" }, { status: 403 });
  }

  const routedToIds = [...new Set(parsed.data.routedToIds ?? [])];
  if (routedToIds.length > 0) {
    const validRoutedTo = await prisma.user.count({
      where: { id: { in: routedToIds }, officeId: session.user.officeId },
    });
    if (validRoutedTo !== routedToIds.length) {
      return NextResponse.json({ error: "Invalid routedToIds" }, { status: 400 });
    }
  }

  const { dateReceived, documentType, complexity, routedToIds: _routedToIds, ...rest } = parsed.data;
  const receivedDate = new Date(dateReceived);
  const dueDate = computeDueDate(receivedDate, complexity);

  const leadDaysMap = { SIMPLE: 3, COMPLEX: 7, HIGHLY_TECHNICAL: 20 } as const;

  // Atomically claim the next sequence number and create the record together,
  // so two simultaneous intakes can never be handed the same routing number.
  const doc = await prisma.$transaction(async (tx) => {
    const office = await tx.office.update({
      where: { id: session.user.officeId },
      data: { incomingSeqCounter: { increment: 1 } },
      select: { incomingSeqCounter: true },
    });

    return tx.incomingDocument.create({
      data: {
        ...rest,
        officeId: session.user.officeId,
        routingNumber: buildRoutingNumber(receivedDate, documentType, office.incomingSeqCounter),
        dateReceived: receivedDate,
        complexity,
        leadTimeDays: leadDaysMap[complexity],
        dueDate,
        routedTo: { create: routedToIds.map((userId) => ({ userId })) },
      },
    });
  });

  await logAudit({
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "CREATE",
    entityType: "IncomingDocument",
    entityId: doc.id,
    details: parsed.data,
  });

  for (const userId of routedToIds) {
    if (userId === session.user.id) continue;
    publishToUser(userId, {
      type: "incoming-routed",
      documentId: doc.id,
      routingNumber: doc.routingNumber,
      documentTitle: doc.documentTitle,
    });
  }

  return NextResponse.json(doc, { status: 201 });
}
