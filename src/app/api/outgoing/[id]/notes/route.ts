import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit, getClientIp } from "@/lib/auditLog";

const createSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

// POST /api/outgoing/[id]/notes — a line on the reply's timeline that is not a
// submission: "waiting on the employer", "endorsed to Legal for comment".
//
// Deliberately changes nothing. It does not move the status, does not number
// anything, and notifies nobody — it exists so a staff member held up by
// somebody outside the office can say so, rather than the document going quiet
// and looking abandoned on the work board. Allowed in any status, including
// after release, because the answer to "what happened to this?" is sometimes
// written down after the fact.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const doc = await prisma.outgoingDocument.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
    select: { id: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const note = await prisma.outgoingNote.create({
    data: { outgoingId: doc.id, body: parsed.data.body, authorId: session.user.id },
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "CREATE",
    entityType: "OutgoingNote",
    entityId: note.id,
    details: { outgoingId: doc.id },
  });

  return NextResponse.json(note, { status: 201 });
}
