import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit, getClientIp } from "@/lib/auditLog";
import {
  buildOutgoingRoutingNumber,
  DOCUMENT_TYPE_CODE_VALUES,
  DOCUMENT_TYPE_OTHER_CODE,
} from "@/lib/documentTypeCodes";
import { z } from "zod";

const createSchema = z.object({
  dateReleased: z.string(), // ISO date string from the client
  // Offices that keep their own register type the tracking number by hand
  // (e.g. "PSD-2026-08-389"). When absent, one is generated as usual. Both
  // land in the same unique column, so a typed duplicate is refused below
  // rather than silently overwriting anything.
  routingNumber: z.string().trim().min(1).optional(),
  documentType: z.enum(DOCUMENT_TYPE_CODE_VALUES),
  documentTypeOther: z.string().trim().min(1).optional(),
  documentTitle: z.string(),
  instructions: z.string().optional(),
  // Their register captures remarks at the point of entry, not only on revisit.
  progressRemarks: z.string().optional(),
  // "Link to Tentative Activity(s) (optional, can select more than one)".
  activityIds: z.array(z.string()).optional(),
  // Receipt acknowledgement — recorded when the recipient takes delivery, which
  // is usually after the record is first created, so all four are optional.
  receivingOffice: z.string().optional(),
  receivedBy: z.string().optional(),
  receivedDate: z.string().optional(),
  receivedTime: z.string().optional(),
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

  const {
    dateReleased,
    routingNumber,
    documentType,
    documentTypeOther,
    receivedDate,
    activityIds: rawActivityIds,
    ...rest
  } = parsed.data;
  const releasedDate = new Date(dateReleased);

  // Office-scoped, exactly as the incoming route does: an activity id from
  // another division must not become linkable by guessing it.
  const activityIds = rawActivityIds ? [...new Set(rawActivityIds)] : undefined;
  if (activityIds && activityIds.length > 0) {
    const ok = await prisma.activity.count({
      where: { id: { in: activityIds }, officeId: session.user.officeId },
    });
    if (ok !== activityIds.length) {
      return NextResponse.json({ error: "Invalid activityIds" }, { status: 400 });
    }
  }

  // "Others" without the specification is a type that says nothing, so it is
  // refused here rather than only hidden behind the form's `required`.
  if (documentType === DOCUMENT_TYPE_OTHER_CODE && !documentTypeOther) {
    return NextResponse.json({ error: "Specify the document type when choosing Others." }, { status: 400 });
  }

  // Atomically claim the next sequence number and create the record
  // together, so two simultaneous dispatches can't collide on a number.
  //
  // A hand-typed number skips the counter entirely: incrementing it for a
  // record that doesn't use it would burn generated numbers and leave gaps in
  // the offices that do.
  let doc;
  try {
    doc = await prisma.$transaction(async (tx) => {
    let number = routingNumber;
    if (!number) {
      const office = await tx.office.update({
        where: { id: session.user.officeId },
        data: { outgoingSeqCounter: { increment: 1 } },
        select: { outgoingSeqCounter: true, code: true },
      });
      const officePrefix = office.code.split("-")[0];
      number = buildOutgoingRoutingNumber(releasedDate, officePrefix, documentType, office.outgoingSeqCounter);
    }

    return tx.outgoingDocument.create({
      data: {
        ...rest,
        officeId: session.user.officeId,
        routingNumber: number,
        // Stored as well as embedded in the routing number, so the ledger can be
        // filtered by type without parsing the number back apart — the incoming
        // side already does this.
        documentType,
        // Only meaningful alongside "Others"; cleared otherwise so a type
        // changed away from Others can't leave a stale specification behind.
        documentTypeOther: documentType === DOCUMENT_TYPE_OTHER_CODE ? documentTypeOther : null,
        dateReleased: releasedDate,
        receivedDate: receivedDate ? new Date(receivedDate) : null,
        ...(activityIds && activityIds.length > 0
          ? { linkedActivities: { create: activityIds.map((activityId) => ({ activityId })) } }
          : {}),
      },
    });
    });
  } catch (e) {
    // Tracking numbers are unique across the whole table. A hand-typed one can
    // collide — with another office's, too — so report it plainly instead of
    // letting a raw constraint error surface as "something went wrong".
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: `Tracking number "${routingNumber}" is already in use.` },
        { status: 409 },
      );
    }
    throw e;
  }

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
