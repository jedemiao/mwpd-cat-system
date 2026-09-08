import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { scannedCopyFileName } from "@/lib/scannedCopy";
import { publishToUser } from "@/lib/notifyBus";

const createSchema = z.object({
  // A version is a draft somebody can open and read. Submitting nothing is a
  // progress note, and that is what POST /api/outgoing/[id]/notes is for.
  fileUrl: z.string().min(1),
  staffNote: z.string().trim().min(1).optional(),
});

// Only a document that is with its author can be submitted. FOR_CHECKING is
// already on the Chief's desk, APPROVED is waiting to be released, and RELEASED
// has left the building — resubmitting any of those would quietly reopen a
// decision somebody already made.
const SUBMITTABLE = ["DRAFT", "RETURNED"] as const;

// POST /api/outgoing/[id]/versions — send the reply up to the Division Chief.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // The display name is taken from the key rather than sent alongside it, so
  // the name on the timeline is always the name of the file that was actually
  // stored. Keys are "{officeId}/{uuid}-{original name}" — see src/lib/minio.ts.
  const fileName = scannedCopyFileName(parsed.data.fileUrl);

  // The file key must be one this office's upload route produced. Same rule as
  // every other scanned copy in the app: never accept a key that names another
  // office's prefix, or the file route's prefix check is being handed the
  // answer it is supposed to be checking.
  if (!parsed.data.fileUrl.startsWith(`${session.user.officeId}/`)) {
    return NextResponse.json({ error: "Invalid file reference" }, { status: 400 });
  }

  const doc = await prisma.outgoingDocument.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
    select: { id: true, status: true, routingNumber: true, documentTitle: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(SUBMITTABLE as readonly string[]).includes(doc.status)) {
    return NextResponse.json(
      { error: `This reply cannot be submitted while it is ${doc.status.toLowerCase().replace("_", " ")}.` },
      { status: 409 },
    );
  }

  // Numbering and the status change go together: a version that existed while
  // the document still read DRAFT would be a submission nobody was told about.
  let version;
  try {
    version = await prisma.$transaction(async (tx) => {
      const existing = await tx.outgoingVersion.count({ where: { outgoingId: doc.id } });
      const created = await tx.outgoingVersion.create({
        data: {
          outgoingId: doc.id,
          versionNumber: existing + 1,
          fileUrl: parsed.data.fileUrl,
          fileName,
          staffNote: parsed.data.staffNote ?? null,
          submittedById: session.user.id,
        },
      });
      await tx.outgoingDocument.update({ where: { id: doc.id }, data: { status: "FOR_CHECKING" } });
      return created;
    });
  } catch (e) {
    // Two submissions racing both compute the same next number; the unique
    // index on (outgoingId, versionNumber) catches the loser. Reloading shows
    // the version that won, which is the whole fix.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Another version was submitted at the same moment. Reload and check before submitting again." },
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
    entityType: "OutgoingVersion",
    entityId: version.id,
    details: { outgoingId: doc.id, versionNumber: version.versionNumber, fileName: version.fileName },
  });

  // The Chief is the only person who can act on this now, so the Chief is who
  // hears about it. Admins are not notified: they can review, but reviewing is
  // not their job, and a notification they are not expected to act on is noise.
  const chiefs = await prisma.user.findMany({
    where: { officeId: session.user.officeId, role: "DIVISION_CHIEF", isActive: true },
    select: { id: true },
  });
  for (const chief of chiefs) {
    if (chief.id === session.user.id) continue;
    publishToUser(chief.id, {
      type: "outgoing-submitted",
      documentId: doc.id,
      routingNumber: doc.routingNumber,
      documentTitle: doc.documentTitle,
      versionNumber: version.versionNumber,
    });
  }

  return NextResponse.json(version, { status: 201 });
}
