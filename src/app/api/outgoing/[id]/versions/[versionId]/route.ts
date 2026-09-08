import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canSignOffAsChief } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { publishToUser } from "@/lib/notifyBus";

const reviewSchema = z.object({
  outcome: z.enum(["APPROVED", "RETURNED"]),
  chiefRemarks: z.string().trim().min(1).optional(),
});

// PATCH /api/outgoing/[id]/versions/[versionId] — the Division Chief's verdict
// on one submission.
//
// Addressed by version id rather than by version number: the number is only
// unique within a document, and an id cannot be misread as "the third one" by a
// client that has a stale list.
export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string; versionId: string }> },
) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!canSignOffAsChief(session.user.role)) {
    return NextResponse.json({ error: "Only the Division Chief can check a reply" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Sending work back without saying why leaves the author guessing at what to
  // change, which is how a reply comes back a third and fourth time. Approving
  // needs no words — the approval is the message.
  if (parsed.data.outcome === "RETURNED" && !parsed.data.chiefRemarks) {
    return NextResponse.json({ error: "Say what needs changing when returning a reply." }, { status: 400 });
  }

  const version = await prisma.outgoingVersion.findFirst({
    where: { id: params.versionId, outgoingId: params.id, outgoing: { officeId: session.user.officeId } },
    include: {
      outgoing: {
        select: {
          id: true,
          routingNumber: true,
          documentTitle: true,
          relatedIncoming: { select: { routedTo: { select: { userId: true } } } },
        },
      },
    },
  });
  if (!version) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (version.reviewedAt) {
    return NextResponse.json({ error: "This version has already been checked." }, { status: 409 });
  }

  // Only the newest submission is open for a verdict. An older one being ruled
  // on would set the document's status from a draft that has already been
  // superseded — approving work the author has since replaced.
  const latest = await prisma.outgoingVersion.findFirst({
    where: { outgoingId: params.id },
    orderBy: { versionNumber: "desc" },
    select: { id: true },
  });
  if (latest?.id !== version.id) {
    return NextResponse.json(
      { error: "A newer version has been submitted. Check that one instead." },
      { status: 409 },
    );
  }

  const [updated] = await prisma.$transaction([
    prisma.outgoingVersion.update({
      where: { id: version.id },
      data: {
        outcome: parsed.data.outcome,
        chiefRemarks: parsed.data.chiefRemarks ?? null,
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      },
    }),
    // The document's status mirrors the verdict on its newest version, so the
    // work board never has to open a document to say where it stands.
    prisma.outgoingDocument.update({
      where: { id: version.outgoing.id },
      data: { status: parsed.data.outcome === "APPROVED" ? "APPROVED" : "RETURNED" },
    }),
  ]);

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "OutgoingVersion",
    entityId: version.id,
    details: {
      outgoingId: version.outgoing.id,
      versionNumber: version.versionNumber,
      outcome: parsed.data.outcome,
    },
  });

  // Whoever has to act next: the staff the document is assigned to, plus the
  // person who submitted this version if they are not among them (a colleague
  // may have sent it up on their behalf). A Set because those two overlap in
  // the ordinary case, and nobody should be told twice.
  const recipients = new Set<string>([
    ...(version.outgoing.relatedIncoming?.routedTo.map((r) => r.userId) ?? []),
    version.submittedById,
  ]);
  recipients.delete(session.user.id);

  for (const userId of recipients) {
    publishToUser(userId, {
      type: parsed.data.outcome === "APPROVED" ? "outgoing-approved" : "outgoing-returned",
      documentId: version.outgoing.id,
      routingNumber: version.outgoing.routingNumber,
      documentTitle: version.outgoing.documentTitle,
      versionNumber: version.versionNumber,
    });
  }

  return NextResponse.json(updated);
}
