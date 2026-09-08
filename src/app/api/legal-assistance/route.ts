import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { officeTracksLegalAssistance } from "@/lib/legalAssistance";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { z } from "zod";

const createSchema = z.object({
  assistanceDate: z.string().min(1),
  legalOfficerId: z.string().min(1),
  clientName: z.string().trim().min(1),
  sex: z.enum(["MALE", "FEMALE"]),
  // The complete set of ticks for the row. An empty array is legal and means
  // "none yet", so it must not be conflated with the field being absent.
  forms: z.array(z.enum(["RV", "MONEY_CLAIMS", "DAW", "DAE", "IR", "TIP", "NON_SUPPORT", "OTHERS"])).optional(),
  // Free text for the OTHERS tick. Sent whether or not the tick is on; the
  // handler decides whether it is kept.
  othersDetail: z.string().nullable().optional(),
  scannedCopyUrl: z.string().nullable().optional(),
});

// GET /api/legal-assistance?q=&year=&month=
export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // The module itself is per-office. Checked in every handler, not only in the
  // pages — an office without it must not reach these rows by calling the route.
  if (!(await officeTracksLegalAssistance(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  const rows = await prisma.legalAssistance.findMany({
    where: {
      officeId: session.user.officeId,
      ...(q
        ? {
            OR: [
              { clientName: { contains: q, mode: Prisma.QueryMode.insensitive } },
              { legalOfficer: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } },
            ],
          }
        : {}),
    },
    // Tie-broken by entry order: assistanceDate is a bare date, so a day's
    // clients sort equal and the order would otherwise drift between requests.
    orderBy: [{ assistanceDate: "desc" }, { createdAt: "desc" }],
    include: { legalOfficer: { select: { id: true, name: true } } },
  });

  return NextResponse.json(rows);
}

// POST /api/legal-assistance — log one client assisted
export async function POST(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksLegalAssistance(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Same office-scoping rule as every other module: an id from the client must
  // point at somebody this office can actually see.
  const officer = await prisma.user.count({
    where: { id: parsed.data.legalOfficerId, officeId: session.user.officeId },
  });
  if (officer !== 1) {
    return NextResponse.json({ error: "Invalid legalOfficerId" }, { status: 400 });
  }

  const forms = [...new Set(parsed.data.forms ?? [])];
  const scannedCopyUrl = parsed.data.scannedCopyUrl?.trim() || null;
  // Never accept a key naming another office's prefix, or the file route's
  // prefix check is being handed the answer it exists to check.
  if (scannedCopyUrl && !scannedCopyUrl.startsWith(`${session.user.officeId}/`)) {
    return NextResponse.json({ error: "Invalid file reference" }, { status: 400 });
  }

  const row = await prisma.legalAssistance.create({
    data: {
      officeId: session.user.officeId,
      assistanceDate: new Date(parsed.data.assistanceDate),
      legalOfficerId: parsed.data.legalOfficerId,
      clientName: parsed.data.clientName,
      sex: parsed.data.sex,
      // De-duplicated: the same tick sent twice is one tick, and the column has
      // no way to mean otherwise.
      forms,
      // Only kept while OTHERS is actually ticked. Storing a detail beside
      // an unticked box would leave the row describing assistance it does
      // not claim to have given.
      othersDetail: forms.includes("OTHERS") ? parsed.data.othersDetail?.trim() || null : null,
      scannedCopyUrl,
    },
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "CREATE",
    entityType: "LegalAssistance",
    entityId: row.id,
    details: parsed.data,
  });

  return NextResponse.json(row, { status: 201 });
}
