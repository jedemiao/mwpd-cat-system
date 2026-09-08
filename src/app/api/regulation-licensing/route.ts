import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { officeTracksRegulationLicensing } from "@/lib/regulationLicensing";
import { logAudit, getClientIp } from "@/lib/auditLog";
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

const createSchema = z.object({
  serviceDate: z.string().min(1),
  personnelId: z.string().min(1),
  requestingParty: z.string().trim().min(1),
  sex: z.enum(["MALE", "FEMALE"]),
  // The complete set of ticks for the row. An empty array is legal and means
  // "none yet", so it must not be conflated with the field being absent.
  services: z.array(serviceEnum).optional(),
  // Free text for the OTHERS tick. Sent whether or not the tick is on; the
  // handler decides whether it is kept.
  othersDetail: z.string().nullable().optional(),
});

// GET /api/regulation-licensing?q=
export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // The module itself is per-office. Checked in every handler, not only in the
  // pages — an office without it must not reach these rows by calling the route.
  if (!(await officeTracksRegulationLicensing(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  const rows = await prisma.regulationLicensing.findMany({
    where: {
      officeId: session.user.officeId,
      ...(q
        ? {
            OR: [
              { requestingParty: { contains: q, mode: Prisma.QueryMode.insensitive } },
              { personnel: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } },
            ],
          }
        : {}),
    },
    // Tie-broken by entry order: serviceDate is a bare date, so a day's callers
    // sort equal and the order would otherwise drift between requests.
    orderBy: [{ serviceDate: "desc" }, { createdAt: "desc" }],
    include: { personnel: { select: { id: true, name: true } } },
  });

  return NextResponse.json(rows);
}

// POST /api/regulation-licensing — log one requesting party served
export async function POST(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksRegulationLicensing(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Same office-scoping rule as every other module: an id from the client must
  // point at somebody this office can actually see.
  const staff = await prisma.user.count({
    where: { id: parsed.data.personnelId, officeId: session.user.officeId },
  });
  if (staff !== 1) {
    return NextResponse.json({ error: "Invalid personnelId" }, { status: 400 });
  }

  const services = [...new Set(parsed.data.services ?? [])];

  const row = await prisma.regulationLicensing.create({
    data: {
      officeId: session.user.officeId,
      serviceDate: new Date(parsed.data.serviceDate),
      personnelId: parsed.data.personnelId,
      requestingParty: parsed.data.requestingParty,
      sex: parsed.data.sex,
      // De-duplicated: the same tick sent twice is one tick, and the column has
      // no way to mean otherwise.
      services,
      // Only kept while OTHERS is actually ticked. Storing a detail beside
      // an unticked box would leave the row describing a service it does
      // not claim to have rendered.
      othersDetail: services.includes("OTHERS") ? parsed.data.othersDetail?.trim() || null : null,
    },
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "CREATE",
    entityType: "RegulationLicensing",
    entityId: row.id,
    details: parsed.data,
  });

  return NextResponse.json(row, { status: 201 });
}
