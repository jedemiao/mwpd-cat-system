import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { officeTracksRegulationLicensing } from "@/lib/regulationLicensing";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { canDelete } from "@/lib/authz";
import { z } from "zod";

const serviceEnum = z.enum([
  "DEPLOYMENT_CERTIFICATE",
  "LRA_DIRECTORY",
  "LRA_VERIFICATION",
  "LRA_PERSONNEL_ACCREDITATION",
  "SRA_ASSISTANCE",
  "SUBMISSION_OF_REPORTS",
  "OTHERS",
]);

const updateSchema = z.object({
  serviceDate: z.string().min(1).optional(),
  personnelId: z.string().min(1).optional(),
  requestingParty: z.string().trim().min(1).optional(),
  sex: z.enum(["MALE", "FEMALE"]).optional(),
  services: z.array(serviceEnum).optional(),
  // Free text for the OTHERS tick. Sent whether or not the tick is on; the
  // handler decides whether it is kept.
  othersDetail: z.string().nullable().optional(),
});

// PATCH /api/regulation-licensing/[id]
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksRegulationLicensing(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await prisma.regulationLicensing.findFirst({
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

  if (parsed.data.personnelId) {
    const staff = await prisma.user.count({
      where: { id: parsed.data.personnelId, officeId: session.user.officeId },
    });
    if (staff !== 1) {
      return NextResponse.json({ error: "Invalid personnelId" }, { status: 400 });
    }
  }

  const services = parsed.data.services ? [...new Set(parsed.data.services)] : undefined;

  const row = await prisma.regulationLicensing.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.serviceDate ? { serviceDate: new Date(parsed.data.serviceDate) } : {}),
      ...(parsed.data.personnelId ? { personnelId: parsed.data.personnelId } : {}),
      ...(parsed.data.requestingParty ? { requestingParty: parsed.data.requestingParty } : {}),
      ...(parsed.data.sex ? { sex: parsed.data.sex } : {}),
      // Replaced wholesale rather than merged — the form always submits every
      // tick it shows, and an empty array has to be able to mean "none", which
      // a merge could not express.
      ...(services ? { services } : {}),
      // Tied to the tick: whenever the set of services is submitted, the
      // detail follows it — cleared outright if OTHERS is no longer among
      // them, so unticking the box cannot leave its wording behind. When
      // services is absent the detail is only touched if it was sent.
      ...(services
        ? { othersDetail: services.includes("OTHERS") ? parsed.data.othersDetail?.trim() || null : null }
        : parsed.data.othersDetail !== undefined
          ? { othersDetail: parsed.data.othersDetail?.trim() || null }
          : {}),
    },
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "RegulationLicensing",
    entityId: row.id,
    details: parsed.data,
  });

  return NextResponse.json(row);
}

// DELETE /api/regulation-licensing/[id] — reserved for Division Chief / Admin
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksRegulationLicensing(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canDelete(session.user.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const existing = await prisma.regulationLicensing.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.regulationLicensing.delete({ where: { id: existing.id } });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "DELETE",
    entityType: "RegulationLicensing",
    entityId: existing.id,
    details: existing,
  });

  return NextResponse.json({ success: true });
}
