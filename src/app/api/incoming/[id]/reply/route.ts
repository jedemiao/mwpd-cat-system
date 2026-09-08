import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { buildReplyRoutingNumber } from "@/lib/documentTypeCodes";

// POST /api/incoming/[id]/reply — start the reply to a received document.
//
// This is the hinge between the two ledgers. Up to here the document has only
// been received and routed; from here it is somebody's work. The reply is
// created as a DRAFT with no release date, because nothing has been released —
// it exists so the staff member has something to attach drafts to and the
// Division Chief has something to check.
//
// It is a route of its own rather than a flag on POST /api/outgoing because it
// is a different act with different rules: the number is inherited rather than
// generated, the incoming document must exist and belong to the caller's
// office, and only one reply is started at a time. Folding that into the
// general create route would have meant a create route that sometimes claims a
// sequence number and sometimes doesn't, decided by a field the client sent.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const incoming = await prisma.incomingDocument.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
    select: {
      id: true,
      routingNumber: true,
      documentTitle: true,
      documentType: true,
      documentTypeOther: true,
      _count: { select: { outgoingReplies: true } },
    },
  });
  if (!incoming) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // The reply inherits the transaction's number and its document type, so the
  // draft opens already knowing what it is answering. Both stay editable on the
  // reply afterwards — a letter can be answered with a memorandum.
  const routingNumber = buildReplyRoutingNumber(incoming.routingNumber, incoming._count.outgoingReplies);

  let doc;
  try {
    doc = await prisma.outgoingDocument.create({
      data: {
        officeId: session.user.officeId,
        relatedIncomingId: incoming.id,
        routingNumber,
        // Null until it is released. A draft has no release date because
        // nothing has left the building.
        dateReleased: null,
        status: "DRAFT",
        documentType: incoming.documentType,
        documentTypeOther: incoming.documentTypeOther,
        documentTitle: `Reply — ${incoming.documentTitle}`,
      },
    });
  } catch (e) {
    // Two people pressing "Draft reply" on the same document at the same moment
    // both compute the same inherited number. The unique index catches the
    // second one; say so plainly rather than returning a raw constraint error,
    // because the fix is simply to open the reply that now exists.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "A reply to this document already exists. Open it from the work board." },
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
    details: { startedAsReplyTo: incoming.id, routingNumber },
  });

  return NextResponse.json(doc, { status: 201 });
}
