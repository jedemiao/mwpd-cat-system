import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { z } from "zod";

const updateSchema = z.object({
  number: z.number().int().optional(),
  title: z.string().optional(),
  fileUrl: z.string().optional(),
  fileName: z.string().optional(),
});

// PATCH /api/forms/[id] — update a template entry. Open to any authenticated
// user, same as POST — the shared library isn't role-gated like other modules.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const existing = await prisma.formTemplate.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const template = await prisma.formTemplate.update({
    where: { id: existing.id },
    data: parsed.data,
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "FormTemplate",
    entityId: template.id,
    details: parsed.data,
  });

  return NextResponse.json(template);
}

// DELETE /api/forms/[id] — remove a template. Open to any authenticated
// user (not canDelete-gated) — confirmed intentional for this module.
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const existing = await prisma.formTemplate.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.formTemplate.delete({ where: { id: existing.id } });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "DELETE",
    entityType: "FormTemplate",
    entityId: existing.id,
    details: existing,
  });

  return NextResponse.json({ success: true });
}
