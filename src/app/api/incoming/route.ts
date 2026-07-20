import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeDueDate } from "@/lib/artaLeadTime";
import { logAudit } from "@/lib/auditLog";
import { publishToUser } from "@/lib/notifyBus";
import { z } from "zod";

const createSchema = z.object({
  dateReceived: z.string(), // ISO date string from the client
  routingNumber: z.string(),
  documentTitle: z.string(),
  routedToId: z.string().optional(),
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
    include: { routedTo: { select: { name: true } } },
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

  const { dateReceived, complexity, ...rest } = parsed.data;
  const receivedDate = new Date(dateReceived);
  const dueDate = computeDueDate(receivedDate, complexity);

  const leadDaysMap = { SIMPLE: 3, COMPLEX: 7, HIGHLY_TECHNICAL: 20 } as const;

  const doc = await prisma.incomingDocument.create({
    data: {
      ...rest,
      officeId: session.user.officeId,
      dateReceived: receivedDate,
      complexity,
      leadTimeDays: leadDaysMap[complexity],
      dueDate,
    },
  });

  await logAudit({
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "CREATE",
    entityType: "IncomingDocument",
    entityId: doc.id,
    details: parsed.data,
  });

  if (doc.routedToId && doc.routedToId !== session.user.id) {
    publishToUser(doc.routedToId, {
      type: "incoming-routed",
      documentId: doc.id,
      routingNumber: doc.routingNumber,
      documentTitle: doc.documentTitle,
    });
  }

  return NextResponse.json(doc, { status: 201 });
}
