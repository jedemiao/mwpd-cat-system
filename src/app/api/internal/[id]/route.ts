import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { canDelete } from "@/lib/authz";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const updateSchema = z.object({
  dateReleased: z.string().optional(),
  memorandumNumber: z.number().int().optional(),
  documentTitle: z.string().optional(),
  instructions: z.string().nullable().optional(),
  receivedBy: z.string().nullable().optional(),
  progressRemarks: z.string().nullable().optional(),
  scannedCopyUrl: z.string().nullable().optional(),
  filed: z.boolean().optional(),
});

// PATCH /api/internal/[id] — update an internal memo record
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const existing = await prisma.internalMemo.findFirst({
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

  const { dateReleased, ...rest } = parsed.data;

  let memo;
  try {
    memo = await prisma.internalMemo.update({
      where: { id: existing.id },
      data: {
        ...rest,
        dateReleased: dateReleased ? new Date(dateReleased) : undefined,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "That memorandum number is already in use" }, { status: 409 });
    }
    throw e;
  }

  await logAudit({
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "InternalMemo",
    entityId: memo.id,
    details: parsed.data,
  });

  return NextResponse.json(memo);
}

// DELETE /api/internal/[id] — reserved for Division Chief / Admin
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!canDelete(session.user.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const existing = await prisma.internalMemo.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.internalMemo.delete({ where: { id: existing.id } });

  await logAudit({
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "DELETE",
    entityType: "InternalMemo",
    entityId: existing.id,
    details: existing,
  });

  return NextResponse.json({ success: true });
}
