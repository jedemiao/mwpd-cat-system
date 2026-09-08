import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { officeTracksLegalAssistance } from "@/lib/legalAssistance";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { canDelete } from "@/lib/authz";
import { z } from "zod";

const updateSchema = z.object({
  assistanceDate: z.string().min(1).optional(),
  legalOfficerId: z.string().min(1).optional(),
  clientName: z.string().trim().min(1).optional(),
  sex: z.enum(["MALE", "FEMALE"]).optional(),
  forms: z.array(z.enum(["RV", "MONEY_CLAIMS", "DAW", "DAE", "IR", "TIP", "NON_SUPPORT", "OTHERS"])).optional(),
  // Free text for the OTHERS tick. Sent whether or not the tick is on; the
  // handler decides whether it is kept.
  othersDetail: z.string().nullable().optional(),
  scannedCopyUrl: z.string().nullable().optional(),
});

// PATCH /api/legal-assistance/[id]
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksLegalAssistance(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await prisma.legalAssistance.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.legalOfficerId) {
    const officer = await prisma.user.count({
      where: { id: parsed.data.legalOfficerId, officeId: session.user.officeId },
    });
    if (officer !== 1) {
      return NextResponse.json({ error: "Invalid legalOfficerId" }, { status: 400 });
    }
  }

  const forms = parsed.data.forms ? [...new Set(parsed.data.forms)] : undefined;
  const scannedCopyUrl =
    parsed.data.scannedCopyUrl === undefined ? undefined : parsed.data.scannedCopyUrl?.trim() || null;
  if (scannedCopyUrl && !scannedCopyUrl.startsWith(`${session.user.officeId}/`)) {
    return NextResponse.json({ error: "Invalid file reference" }, { status: 400 });
  }

  const row = await prisma.legalAssistance.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.assistanceDate ? { assistanceDate: new Date(parsed.data.assistanceDate) } : {}),
      ...(parsed.data.legalOfficerId ? { legalOfficerId: parsed.data.legalOfficerId } : {}),
      ...(parsed.data.clientName ? { clientName: parsed.data.clientName } : {}),
      ...(parsed.data.sex ? { sex: parsed.data.sex } : {}),
      // Replaced wholesale rather than merged — the form always submits every
      // tick it shows, and an empty array has to be able to mean "none", which
      // a merge could not express.
      ...(forms ? { forms } : {}),
      // Tied to the tick: whenever the set of forms is submitted, the
      // detail follows it — cleared outright if OTHERS is no longer among
      // them, so unticking the box cannot leave its wording behind. When
      // forms is absent the detail is only touched if it was sent.
      ...(forms
        ? { othersDetail: forms.includes("OTHERS") ? parsed.data.othersDetail?.trim() || null : null }
        : parsed.data.othersDetail !== undefined
          ? { othersDetail: parsed.data.othersDetail?.trim() || null }
          : {}),
      // Absent leaves the stored value alone; null or "" clears it.
      scannedCopyUrl,
    },
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "LegalAssistance",
    entityId: row.id,
    details: parsed.data,
  });

  return NextResponse.json(row);
}

// DELETE /api/legal-assistance/[id] — reserved for Division Chief / Admin
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksLegalAssistance(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canDelete(session.user.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const existing = await prisma.legalAssistance.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.legalAssistance.delete({ where: { id: existing.id } });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "DELETE",
    entityType: "LegalAssistance",
    entityId: existing.id,
    details: existing,
  });

  return NextResponse.json({ success: true });
}
