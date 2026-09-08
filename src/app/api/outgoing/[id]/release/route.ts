import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { publishToUser } from "@/lib/notifyBus";
import { buildOutgoingRoutingNumber, type DocumentTypeCode } from "@/lib/documentTypeCodes";
import { parseReceivingOffices } from "@/lib/receivingOffices";
import { resolveReceivingOffices } from "@/lib/documentDelivery";

const releaseSchema = z.object({
  // Defaults to today. Given explicitly for a document that left the office
  // before anybody got to the computer, which is the ordinary case.
  dateReleased: z.string().optional(),
});

// POST /api/outgoing/[id]/release — the document physically leaves.
//
// Three things happen here that happen nowhere else, and they happen together
// because a half-done release is worse than none:
//
//  1. A generated tracking number is claimed, if this document does not already
//     have one. Replies arrived with the incoming document's number; originated
//     dispatches have waited until now, so the number they get sits in the
//     register in the date order its format implies.
//  2. The dispatch becomes a register entry — status RELEASED with a real
//     release date.
//  3. The incoming document it answers is closed. Every routed document is
//     answered, so the answer leaving *is* the completion — nobody should have
//     to remember to go back and tick the other ledger.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = releaseSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const doc = await prisma.outgoingDocument.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
    select: {
      id: true,
      status: true,
      routingNumber: true,
      documentType: true,
      documentTitle: true,
      receivingOffice: true,
      relatedIncomingId: true,
      relatedIncoming: {
        select: { id: true, dateCompleted: true, routedTo: { select: { userId: true } } },
      },
    },
  });
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Whether approval is required at all is the office's own rule
  // (Office.requiresChiefApproval). MWPTD works draft -> submit -> approve ->
  // release; the other divisions release directly, and for them this route is
  // the whole flow rather than the last step of one.
  const office = await prisma.office.findUniqueOrThrow({
    where: { id: session.user.officeId },
    select: { requiresChiefApproval: true },
  });

  if (doc.status === "RELEASED") {
    return NextResponse.json({ error: "This document has already been released." }, { status: 409 });
  }

  // Where the gate applies, releasing is the records clerk's act and not a
  // second approval — the decision was made when the Chief approved the
  // version, and this route must not become a way around it.
  if (office.requiresChiefApproval && doc.status !== "APPROVED") {
    return NextResponse.json(
      { error: "Only a reply the Division Chief has approved can be released." },
      { status: 409 },
    );
  }

  const releasedDate = parsed.data.dateReleased ? new Date(parsed.data.dateReleased) : new Date();
  if (Number.isNaN(releasedDate.getTime())) {
    return NextResponse.json({ error: "Invalid release date" }, { status: 400 });
  }

  // Which ticked offices are divisions that keep their records here. Read
  // before the transaction because it is a plain lookup against a roster
  // nothing in this request changes.
  //
  // The sender is excluded: a division ticks its own box to record that a
  // copy stayed in-house, and delivering a document to the desk it was
  // written at would put it in their own tray to file from themselves.
  const { selected } = parseReceivingOffices(doc.receivingOffice);
  const recipients = await resolveReceivingOffices(selected);
  const recipientOfficeIds = recipients
    .map((office) => office.id)
    .filter((id) => id !== session.user.officeId);

  let released;
  try {
    released = await prisma.$transaction(async (tx) => {
      let number = doc.routingNumber;

      // Claimed inside the transaction, so two clerks releasing at the same
      // moment cannot be handed the same number.
      if (!number) {
        const office = await tx.office.update({
          where: { id: session.user.officeId },
          data: { outgoingSeqCounter: { increment: 1 } },
          select: { outgoingSeqCounter: true, code: true },
        });
        const officePrefix = office.code.split("-")[0];
        number = buildOutgoingRoutingNumber(
          releasedDate,
          officePrefix,
          (doc.documentType ?? "L") as DocumentTypeCode,
          office.outgoingSeqCounter,
        );
      }

      const updated = await tx.outgoingDocument.update({
        where: { id: doc.id },
        data: { status: "RELEASED", dateReleased: releasedDate, routingNumber: number },
      });

      // Closing the incoming side is the point of the whole flow. Guarded on
      // it being open: a document closed by hand earlier keeps the date
      // somebody deliberately entered rather than having it silently rewritten.
      if (doc.relatedIncoming && !doc.relatedIncoming.dateCompleted) {
        await tx.incomingDocument.update({
          where: { id: doc.relatedIncoming.id },
          data: { dateCompleted: releasedDate },
        });
      }

      // Addressing becomes delivery here and nowhere else, in the same
      // transaction as the release itself: a dispatch that is RELEASED but
      // has not reached the divisions it names is exactly the half-done state
      // this route exists to avoid.
      //
      // createMany with skipDuplicates rather than a create per office: the
      // unique index on (outgoingId, toOfficeId) is what stops a re-release
      // raising a second delivery for a division that already has one, and
      // skipping is the right answer to that rather than an error.
      if (recipientOfficeIds.length > 0) {
        await tx.documentDelivery.createMany({
          data: recipientOfficeIds.map((toOfficeId) => ({ outgoingId: doc.id, toOfficeId })),
          skipDuplicates: true,
        });
      }

      return updated;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "That tracking number is already in use. Try releasing again." },
        { status: 409 },
      );
    }
    throw e;
  }

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "OutgoingDocument",
    entityId: doc.id,
    details: {
      released: true,
      routingNumber: released.routingNumber,
      dateReleased: released.dateReleased,
      closedIncomingId: doc.relatedIncoming && !doc.relatedIncoming.dateCompleted ? doc.relatedIncoming.id : null,
      deliveredToOfficeIds: recipientOfficeIds,
    },
  });

  // The people who were carrying this can stop carrying it.
  for (const { userId } of doc.relatedIncoming?.routedTo ?? []) {
    if (userId === session.user.id) continue;
    publishToUser(userId, { type: "incoming-completed", documentId: doc.relatedIncoming!.id });
  }

  // Tell the divisions it was addressed to. They cannot see this office's
  // ledger, so without this the delivery sits in a tray nobody has been told
  // about — which is the failure the whole hand-over is meant to end.
  if (recipientOfficeIds.length > 0) {
    const sender = await prisma.office.findUnique({
      where: { id: session.user.officeId },
      select: { code: true },
    });
    const recipientStaff = await prisma.user.findMany({
      where: { officeId: { in: recipientOfficeIds }, isActive: true },
      select: { id: true },
    });
    for (const { id: userId } of recipientStaff) {
      publishToUser(userId, {
        type: "delivery-arrived",
        // Their Incoming page is where the tray lives, and the document has
        // no id in their office until they file it.
        documentId: doc.id,
        routingNumber: released.routingNumber,
        documentTitle: doc.documentTitle,
        officeCode: sender?.code ?? "",
      });
    }
  }

  return NextResponse.json(released);
}
