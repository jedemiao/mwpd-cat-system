import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageUsers, MANAGER_ROLES } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { z } from "zod";

const patchSchema = z
  .object({
    role: z.nativeEnum(Role).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.role !== undefined || v.isActive !== undefined, {
    message: "Nothing to update.",
  });

// PATCH /api/users/[id] — change a colleague's role, or deactivate/reactivate
// their account.
//
// There is deliberately no DELETE here. Leave, AuditLog, IncomingRoutedStaff
// and ActivityAssignee all hold foreign keys to User; deleting a departed staff
// member would either fail or take their history with it. Deactivation is the
// supported way to remove someone's access.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Check the details and try again.";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  // Acting on your own account here is always a mistake waiting to happen —
  // demoting or deactivating yourself mid-session locks you out of the very
  // screen you'd need to undo it. Own password changes live in Settings.
  if (id === session.user.id) {
    return NextResponse.json({ error: "You can't change your own role or status." }, { status: 400 });
  }

  // Office-scoped: a Chief can never reach an account in another office.
  const target = await prisma.user.findFirst({
    where: { id, officeId: session.user.officeId },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  // A Division Chief must not be able to touch an Admin, or promote anyone
  // into Admin — only an Admin can do either.
  if (session.user.role !== "ADMIN") {
    if (target.role === "ADMIN") {
      return NextResponse.json({ error: "Not permitted" }, { status: 403 });
    }
    if (parsed.data.role === "ADMIN") {
      return NextResponse.json({ error: "Only an administrator can grant the administrator role." }, { status: 403 });
    }
  }

  const nextRole = parsed.data.role ?? target.role;
  const nextIsActive = parsed.data.isActive ?? target.isActive;

  // Lockout backstop: every office must keep at least one active account that
  // can manage users, or nobody can undo anything here without direct database
  // access.
  //
  // As the route stands this cannot actually fire — the caller is always an
  // active Chief/Admin (getActiveSession verifies that against the database)
  // and can't target their own row, so at least one manager always survives.
  // The real protection today is the self-guard above. This is kept for the
  // day someone relaxes that rule, e.g. to allow stepping down; without it,
  // that change would silently make office lockout reachable.
  const losesManager = target.isActive && MANAGER_ROLES.includes(target.role);
  const staysManager = nextIsActive && MANAGER_ROLES.includes(nextRole);
  if (losesManager && !staysManager) {
    const otherManagers = await prisma.user.count({
      where: {
        officeId: session.user.officeId,
        isActive: true,
        role: { in: MANAGER_ROLES },
        id: { not: target.id },
      },
    });
    if (otherManagers === 0) {
      return NextResponse.json(
        { error: "This is the last active Division Chief or Admin in the office — promote someone else first." },
        { status: 409 },
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { role: nextRole, isActive: nextIsActive },
    select: { id: true, name: true, username: true, role: true, isActive: true },
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "User",
    entityId: target.id,
    details: {
      targetName: target.name,
      before: { role: target.role, isActive: target.isActive },
      after: { role: updated.role, isActive: updated.isActive },
    },
  });

  return NextResponse.json({ user: updated });
}
