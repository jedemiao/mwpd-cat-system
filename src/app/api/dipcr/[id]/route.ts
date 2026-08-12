import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { officeTracksDipcr } from "@/lib/dipcr";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { canDelete } from "@/lib/authz";
import { z } from "zod";

const accomplishmentSchema = z.object({
  month: z.number().int().min(1).max(12),
  narrative: z.string(),
});

const updateSchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
  semester: z.enum(["FIRST", "SECOND"]).optional(),
  section: z.string().trim().min(1).optional(),
  pap: z.string().trim().min(1).optional(),
  successIndicator: z.string().trim().min(1).optional(),
  allottedBudget: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Budget must be a number with up to two decimals")
    .nullable()
    .optional(),
  remarks: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  accountableIds: z.array(z.string()).optional(),
  accomplishments: z.array(accomplishmentSchema).optional(),
});

// PATCH /api/dipcr/[id] — update one success indicator row and its cells
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksDipcr(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await prisma.dipcrIndicator.findFirst({
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

  const accountableIds = parsed.data.accountableIds
    ? [...new Set(parsed.data.accountableIds)]
    : undefined;
  if (accountableIds && accountableIds.length > 0) {
    const valid = await prisma.user.count({
      where: { id: { in: accountableIds }, officeId: session.user.officeId },
    });
    if (valid !== accountableIds.length) {
      return NextResponse.json({ error: "Invalid accountableIds" }, { status: 400 });
    }
  }

  const accomplishments = parsed.data.accomplishments
    ? parsed.data.accomplishments.filter((a) => a.narrative.trim() !== "")
    : undefined;
  if (accomplishments) {
    const months = accomplishments.map((a) => a.month);
    if (new Set(months).size !== months.length) {
      return NextResponse.json({ error: "The same month was sent twice" }, { status: 400 });
    }
  }

  const { allottedBudget, accountableIds: _a, accomplishments: _b, ...rest } = parsed.data;

  const indicator = await prisma.$transaction(async (tx) => {
    // Both child sets are replaced wholesale rather than diffed — the form
    // always submits the complete set, and an empty array has to be able to
    // mean "none", which a diff could not express. Same rule the Incoming
    // route follows for routedTo and linked activities.
    if (accountableIds) {
      await tx.dipcrAccountable.deleteMany({ where: { indicatorId: existing.id } });
    }
    if (accomplishments) {
      await tx.dipcrAccomplishment.deleteMany({ where: { indicatorId: existing.id } });
    }

    return tx.dipcrIndicator.update({
      where: { id: existing.id },
      data: {
        ...rest,
        // Absent leaves the stored value alone; null clears it.
        allottedBudget: allottedBudget === undefined ? undefined : allottedBudget,
        ...(accountableIds
          ? { accountable: { create: accountableIds.map((userId) => ({ userId })) } }
          : {}),
        ...(accomplishments
          ? {
              accomplishments: {
                create: accomplishments.map((a) => ({ month: a.month, narrative: a.narrative.trim() })),
              },
            }
          : {}),
      },
    });
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "DipcrIndicator",
    entityId: indicator.id,
    details: parsed.data,
  });

  return NextResponse.json(indicator);
}

// DELETE /api/dipcr/[id] — reserved for Division Chief / Admin
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksDipcr(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canDelete(session.user.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const existing = await prisma.dipcrIndicator.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
    include: { accountable: true, accomplishments: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // The child rows go with it — see the cascade on both foreign keys.
  await prisma.dipcrIndicator.delete({ where: { id: existing.id } });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "DELETE",
    entityType: "DipcrIndicator",
    entityId: existing.id,
    details: existing,
  });

  return NextResponse.json({ success: true });
}
