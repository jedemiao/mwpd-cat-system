import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { computeDueDate } from "@/lib/artaLeadTime";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { publishToUser } from "@/lib/notifyBus";
import { canSignOffAsChief } from "@/lib/authz";
import {
  buildRoutingNumber,
  buildInternalRoutingNumber,
  DOCUMENT_TYPE_CODE_VALUES,
  DOCUMENT_TYPE_OTHER_CODE,
} from "@/lib/documentTypeCodes";
import { z } from "zod";

// The DC column — see src/lib/authz.ts. Routine intake (date received,
// routing number, title) is left open to whoever is creating the record.
const CHIEF_ONLY_FIELDS = ["routedToIds", "instructions", "complexity"] as const;

// "HH:MM", 24-hour — what <input type="time"> submits.
const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM")
  .optional()
  .or(z.literal(""));

const createSchema = z.object({
  dateReceived: z.string(), // ISO date string from the client
  timeReceived: timeString,
  documentType: z.enum(DOCUMENT_TYPE_CODE_VALUES),
  documentTypeOther: z.string().trim().min(1).optional(),
  documentTitle: z.string(),
  origin: z.enum(["INTERNAL", "EXTERNAL"]).default("EXTERNAL"),
  receivedById: z.string().optional().or(z.literal("")),
  originAgency: z.string().optional(),
  signatory: z.string().optional(),
  notes: z.string().optional(),
  activityIds: z.array(z.string()).optional(),
  routedToIds: z.array(z.string()).optional(),
  instructions: z.string().optional(),
  complexity: z.enum(["SIMPLE", "COMPLEX", "HIGHLY_TECHNICAL"]).default("SIMPLE"),
});

// GET /api/incoming — list documents for the logged-in user's office, newest first
export async function GET(req: NextRequest) {
  const session = await getActiveSession();
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
  const session = await getActiveSession();
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

  let routedToIds = [...new Set(parsed.data.routedToIds ?? [])];
  if (routedToIds.length > 0) {
    const validRoutedTo = await prisma.user.count({
      where: { id: { in: routedToIds }, officeId: session.user.officeId },
    });
    if (validRoutedTo !== routedToIds.length) {
      return NextResponse.json({ error: "Invalid routedToIds" }, { status: 400 });
    }
  }

  // Intake staff can't set routing themselves (see CHIEF_ONLY_FIELDS above) —
  // every document they create lands on the Division Chief's desk first, and
  // the Chief re-routes to actual staff from there.
  if (!canSignOffAsChief(session.user.role)) {
    const chiefs = await prisma.user.findMany({
      where: { officeId: session.user.officeId, role: "DIVISION_CHIEF" },
      select: { id: true },
    });
    routedToIds = chiefs.map((c) => c.id);
  }

  // Intake references must belong to this office — never trust an id from the
  // client to point somewhere the caller can see.
  const { receivedById, activityIds } = parsed.data;
  if (receivedById) {
    const ok = await prisma.user.count({ where: { id: receivedById, officeId: session.user.officeId } });
    if (ok !== 1) return NextResponse.json({ error: "Invalid receivedById" }, { status: 400 });
  }
  const linkedActivityIds = [...new Set(activityIds ?? [])];
  if (linkedActivityIds.length > 0) {
    const ok = await prisma.activity.count({
      where: { id: { in: linkedActivityIds }, officeId: session.user.officeId },
    });
    if (ok !== linkedActivityIds.length) {
      return NextResponse.json({ error: "Invalid activityIds" }, { status: 400 });
    }
  }

  const {
    dateReceived,
    documentType,
    documentTypeOther,
    complexity,
    routedToIds: _routedToIds,
    activityIds: _activityIds,
    receivedById: _receivedById,
    timeReceived,
    ...rest
  } = parsed.data;
  const receivedDate = new Date(dateReceived);

  // "Others" without the specification is a type that says nothing, so it is
  // refused here rather than only hidden behind the form's `required`.
  if (documentType === DOCUMENT_TYPE_OTHER_CODE && !documentTypeOther) {
    return NextResponse.json({ error: "Specify the document type when choosing Others." }, { status: 400 });
  }

  // NOTE: timeReceived is stored but deliberately not fed into computeDueDate —
  // the office's cutoff rule is undecided. See docs/PHP-TRACKER-ADOPTION.md.
  const dueDate = computeDueDate(receivedDate, complexity);

  const leadDaysMap = { SIMPLE: 3, COMPLEX: 7, HIGHLY_TECHNICAL: 20 } as const;

  // Atomically claim the next sequence number and create the record together,
  // so two simultaneous intakes can never be handed the same routing number.
  // Internal and external are separate ledgers to this office, each counting
  // from 001, so they claim from separate counters. `rest.origin` carries the
  // validated enum (defaulted to EXTERNAL by the schema above).
  const isInternal = rest.origin === "INTERNAL";

  const doc = await prisma.$transaction(async (tx) => {
    const office = await tx.office.update({
      where: { id: session.user.officeId },
      data: isInternal
        ? { incomingInternalSeqCounter: { increment: 1 } }
        : { incomingSeqCounter: { increment: 1 } },
      select: { incomingSeqCounter: true, incomingInternalSeqCounter: true },
    });

    return tx.incomingDocument.create({
      data: {
        ...rest,
        officeId: session.user.officeId,
        routingNumber: isInternal
          ? buildInternalRoutingNumber(receivedDate, documentType, office.incomingInternalSeqCounter)
          : buildRoutingNumber(receivedDate, documentType, office.incomingSeqCounter),
        // Stored as well as embedded in the routing number, so the ledger can
        // be filtered by type without parsing the number back apart.
        documentType,
        // Only meaningful alongside "Others"; cleared otherwise so a type
        // changed away from Others can't leave a stale specification behind.
        documentTypeOther: documentType === DOCUMENT_TYPE_OTHER_CODE ? documentTypeOther : null,
        dateReceived: receivedDate,
        timeReceived: timeReceived || null,
        receivedById: receivedById || null,
        complexity,
        leadTimeDays: leadDaysMap[complexity],
        dueDate,
        routedTo: { create: routedToIds.map((userId) => ({ userId })) },
        linkedActivities: { create: linkedActivityIds.map((activityId) => ({ activityId })) },
      },
    });
  });

  await logAudit({
    ipAddress: getClientIp(req),
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
