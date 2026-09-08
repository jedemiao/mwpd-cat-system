import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { officeTracksIpcrRatingGuide, usedDescriptors } from "@/lib/ipcrRatingGuide";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { canDelete } from "@/lib/authz";
import { z } from "zod";

const descriptorSchema = z.object({
  dimension: z.enum(["QUALITY", "EFFICIENCY", "TIMELINESS"]),
  level5: z.string().nullable().optional(),
  level4: z.string().nullable().optional(),
  level3: z.string().nullable().optional(),
  level2: z.string().nullable().optional(),
  level1: z.string().nullable().optional(),
});

const updateSchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
  semester: z.enum(["FIRST", "SECOND"]).optional(),
  section: z.string().trim().min(1).optional(),
  pap: z.string().trim().min(1).optional(),
  successIndicator: z.string().trim().min(1).optional(),
  meansOfVerification: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  accountableIds: z.array(z.string()).optional(),
  descriptors: z.array(descriptorSchema).optional(),
});

// PATCH /api/ipcr-rating-guide/[id] — update one indicator and its scale
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksIpcrRatingGuide(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await prisma.ipcrRatingGuideRow.findFirst({
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

  const descriptors = parsed.data.descriptors ? usedDescriptors(parsed.data.descriptors) : undefined;
  if (descriptors) {
    const dimensions = descriptors.map((d) => d.dimension);
    if (new Set(dimensions).size !== dimensions.length) {
      return NextResponse.json({ error: "The same rating dimension was sent twice" }, { status: 400 });
    }
  }

  const { accountableIds: _a, descriptors: _d, meansOfVerification, ...rest } = parsed.data;

  const row = await prisma.$transaction(async (tx) => {
    // Both child sets are replaced wholesale rather than diffed — the form
    // always submits the complete set, and an empty array has to be able to
    // mean "none", which a diff could not express. Same rule the D/IPCR and
    // Incoming routes follow.
    if (accountableIds) {
      await tx.ipcrRatingGuideAccountable.deleteMany({ where: { rowId: existing.id } });
    }
    if (descriptors) {
      await tx.ipcrRatingDescriptor.deleteMany({ where: { rowId: existing.id } });
    }

    return tx.ipcrRatingGuideRow.update({
      where: { id: existing.id },
      data: {
        ...rest,
        // Absent leaves the stored value alone; null or "" clears it.
        meansOfVerification:
          meansOfVerification === undefined ? undefined : meansOfVerification?.trim() || null,
        ...(accountableIds
          ? { accountable: { create: accountableIds.map((userId) => ({ userId })) } }
          : {}),
        ...(descriptors ? { ratings: { create: descriptors } } : {}),
      },
    });
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "IpcrRatingGuideRow",
    entityId: row.id,
    details: parsed.data,
  });

  return NextResponse.json(row);
}

// DELETE /api/ipcr-rating-guide/[id] — reserved for Division Chief / Admin
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await officeTracksIpcrRatingGuide(session.user.officeId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canDelete(session.user.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const existing = await prisma.ipcrRatingGuideRow.findFirst({
    where: { id: params.id, officeId: session.user.officeId },
    include: { accountable: true, ratings: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // The child rows go with it — see the cascade on both foreign keys.
  await prisma.ipcrRatingGuideRow.delete({ where: { id: existing.id } });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "DELETE",
    entityType: "IpcrRatingGuideRow",
    entityId: existing.id,
    details: existing,
  });

  return NextResponse.json({ success: true });
}
