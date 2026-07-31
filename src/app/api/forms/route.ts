import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { z } from "zod";

const createSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  fileUrl: z.string(),
  fileName: z.string(),
});

// GET /api/forms — list the shared template library, in display order.
// Not office-scoped: these are standard DMW forms reused by every office.
export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const templates = await prisma.formTemplate.findMany({
    orderBy: { number: "asc" },
    include: { uploadedBy: { select: { name: true } } },
  });

  return NextResponse.json(templates);
}

// POST /api/forms — add a template to the shared library.
// Open to any authenticated user (not canDelete-gated like other modules) —
// these are reference documents, not compliance records.
export async function POST(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const template = await prisma.formTemplate.create({
    data: {
      ...parsed.data,
      uploadedById: session.user.id,
    },
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "CREATE",
    entityType: "FormTemplate",
    entityId: template.id,
    details: parsed.data,
  });

  return NextResponse.json(template, { status: 201 });
}
