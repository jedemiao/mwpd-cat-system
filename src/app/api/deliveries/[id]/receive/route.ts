import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { publishToUser } from "@/lib/notifyBus";
import {
  buildRoutingNumber,
  DOCUMENT_TYPE_OTHER_CODE,
  type DocumentTypeCode,
} from "@/lib/documentTypeCodes";
import { addWorkingDays } from "@/lib/artaLeadTime";
import { copyObjectToOffice } from "@/lib/minio";

const receiveSchema = z.object({
  // Defaults to today. Given explicitly for a document that reached the desk
  // before anybody got to the computer, which is the ordinary case.
  dateReceived: z.string().optional(),
  timeReceived: z.string().optional(),
  // The receiving office classifies it themselves: the sender's type describes
  // the dispatch they wrote, not what it is to the division taking it in.
  documentType: z.string().optional(),
  complexity: z.enum(["SIMPLE", "COMPLEX", "HIGHLY_TECHNICAL"]).optional(),
});

const LEAD_DAYS = { SIMPLE: 3, COMPLEX: 7, HIGHLY_TECHNICAL: 20 } as const;
const MAX_ATTEMPTS = 5;

// POST /api/deliveries/[id]/receive — the addressed division takes the document
// in, and it becomes a numbered entry in their own Incoming register.
//
// This is the only route in the app that reads a row belonging to another
// office's document, and it does so through exactly one door: the delivery's
// toOfficeId must be the caller's office. Everything it then creates belongs to
// the caller's office as usual.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = receiveSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Scoped to the recipient. A delivery addressed elsewhere is not "forbidden"
  // to this office, it is none of their business — so 404, the same answer the
  // rest of the app gives for another office's row.
  const delivery = await prisma.documentDelivery.findFirst({
    where: { id: params.id, toOfficeId: session.user.officeId },
    include: {
      outgoing: {
        select: {
          id: true,
          officeId: true,
          routingNumber: true,
          documentTitle: true,
          documentType: true,
          scannedCopyUrl: true,
          receivedBy: true,
          receivedDate: true,
          office: { select: { code: true, name: true } },
        },
      },
    },
  });
  if (!delivery) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (delivery.status === "RECEIVED") {
    return NextResponse.json(
      { error: "This delivery has already been filed." },
      { status: 409 },
    );
  }

  const receivedDate = parsed.data.dateReceived ? new Date(parsed.data.dateReceived) : new Date();
  if (Number.isNaN(receivedDate.getTime())) {
    return NextResponse.json({ error: "Invalid received date" }, { status: 400 });
  }

  const complexity = parsed.data.complexity ?? "SIMPLE";
  const documentType = parsed.data.documentType || delivery.outgoing.documentType || "L";

  // Copied before the transaction: it talks to MinIO, which must not hold a
  // database transaction open, and an orphaned copy is a far cheaper mistake
  // than a register entry whose attachment nobody can open.
  let scannedCopyUrl: string | null = null;
  if (delivery.outgoing.scannedCopyUrl) {
    try {
      scannedCopyUrl = await copyObjectToOffice(
        delivery.outgoing.scannedCopyUrl,
        session.user.officeId,
      );
    } catch {
      // The document still arrived. Filing it without the scan is better than
      // refusing the delivery over a storage hiccup — the sender's copy is
      // still there to chase.
      scannedCopyUrl = null;
    }
  }

  // Numbered exactly like anything else this office files: its own counter,
  // its own format.
  const claimNumberAndCreate = () =>
    prisma.$transaction(async (tx) => {
      // Always the EXTERNAL run, on every office. A document arriving from
      // another division is external *to the division receiving it* — that is
      // how the offices read their own split, and Incoming > External is where
      // they expect to find it. The Internal ledger is for a division's own
      // paperwork, not for anything that came from elsewhere in DMW.
      //
      // MWPTD keeps a single ledger (splitIncomingLedgers false), so it lands
      // in plain Incoming either way — but it must still draw from the same
      // counter every other document there uses.

      const office = await tx.office.update({
        where: { id: session.user.officeId },
        data: { incomingSeqCounter: { increment: 1 } },
        select: { incomingSeqCounter: true },
      });

      const incoming = await tx.incomingDocument.create({
        data: {
          officeId: session.user.officeId,
          routingNumber: buildRoutingNumber(
            receivedDate,
            documentType as DocumentTypeCode,
            office.incomingSeqCounter,
          ),
          documentType,
          documentTypeOther: documentType === DOCUMENT_TYPE_OTHER_CODE ? "From another division" : null,
          documentTitle: delivery.outgoing.documentTitle,
          // External to this division, whatever its DMW origin — and the
          // agency column names the division it came from, so "where did this
          // come from?" is answerable without opening the record.
          origin: "EXTERNAL",
          originAgency: delivery.outgoing.office.code,
          dateReceived: receivedDate,
          timeReceived: parsed.data.timeReceived || null,
          receivedById: session.user.id,
          complexity,
          leadTimeDays: LEAD_DAYS[complexity],
          dueDate: addWorkingDays(receivedDate, LEAD_DAYS[complexity]),
          scannedCopyUrl,
        },
      });

      await tx.documentDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "RECEIVED",
          receivedIncomingId: incoming.id,
          receivedById: session.user.id,
          receivedAt: new Date(),
        },
      });

      // The other half of the point: the sender's receipt columns, which until
      // now could only be filled by ringing up to ask. Only written if still
      // empty — a dispatch addressed to several divisions has one receipt line
      // and many deliveries, so the first acknowledgement stamps it and the
      // per-division detail lives on the delivery rows.
      if (!delivery.outgoing.receivedDate && !delivery.outgoing.receivedBy) {
        await tx.outgoingDocument.update({
          where: { id: delivery.outgoing.id },
          data: {
            receivedBy: session.user.name ?? null,
            receivedDate: receivedDate,
            receivedTime: parsed.data.timeReceived || null,
          },
        });
      }

      return incoming;
    });

  // Identical retry to POST /api/incoming: a generated number can collide when
  // the office's counter has fallen behind the numbers already filed, and the
  // person receiving cannot fix that by retyping anything.
  let incoming;
  for (let attempt = 1; ; attempt++) {
    try {
      incoming = await claimNumberAndCreate();
      break;
    } catch (e) {
      const isDuplicateNumber =
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (!isDuplicateNumber) throw e;

      if (attempt >= MAX_ATTEMPTS) {
        return NextResponse.json(
          {
            error:
              "Could not assign a routing number — the numbering is out of step with the documents already filed. Ask an administrator to check the office's sequence counter.",
          },
          { status: 409 },
        );
      }

      // Advances the same counter the transaction draws from.
      await prisma.office.update({
        where: { id: session.user.officeId },
        data: { incomingSeqCounter: { increment: 1 } },
      });
    }
  }

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "CREATE",
    entityType: "IncomingDocument",
    entityId: incoming.id,
    details: {
      receivedFromOffice: delivery.outgoing.office.code,
      deliveryId: delivery.id,
      sourceOutgoingId: delivery.outgoing.id,
      sourceRoutingNumber: delivery.outgoing.routingNumber,
      routingNumber: incoming.routingNumber,
    },
  });

  // Tell the sending division it landed. They cannot see this office's ledger,
  // so this is the only way they learn without asking.
  const [recipientOffice, senders] = await Promise.all([
    prisma.office.findUnique({ where: { id: session.user.officeId }, select: { code: true } }),
    prisma.user.findMany({
      where: { officeId: delivery.outgoing.officeId, isActive: true },
      select: { id: true },
    }),
  ]);
  for (const sender of senders) {
    publishToUser(sender.id, {
      type: "delivery-received",
      documentId: delivery.outgoing.id,
      routingNumber: delivery.outgoing.routingNumber,
      documentTitle: delivery.outgoing.documentTitle,
      // The division that took it in — which is what the sender is waiting to
      // hear, not their own code back.
      officeCode: recipientOffice?.code ?? "",
    });
  }

  return NextResponse.json(incoming, { status: 201 });
}
