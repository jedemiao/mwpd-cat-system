import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canResetStaffPassword } from "@/lib/authz";
import { passwordSchema } from "@/lib/passwordPolicy";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { z } from "zod";

const resetSchema = z.object({
  userId: z.string(),
  newPassword: passwordSchema,
});

// POST /api/account/reset-password — a Division Chief (or Admin) sets a new
// password for a staff member who forgot theirs. No current password is
// required — that's the whole point — so the actor's authority is the only
// gate. Office-scoped and audit-logged; the new password itself is never
// written to the audit trail.
export async function POST(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!canResetStaffPassword(session.user.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    // A string, not error.flatten() — the form renders `error` directly, and an
    // object would surface to the Chief as a generic "something went wrong"
    // instead of telling them which password rule was missed.
    const first = parsed.error.issues[0]?.message ?? "Check the details and try again.";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  const { userId, newPassword } = parsed.data;

  // Scope to the actor's own office; a Chief can never reset an account that
  // belongs to another office.
  const target = await prisma.user.findFirst({
    where: { id: userId, officeId: session.user.officeId },
  });
  if (!target) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  // A Division Chief must not be able to reset an Admin (the superuser) — that
  // would be a privilege escalation. Only an Admin can reset another Admin.
  if (session.user.role !== "ADMIN" && target.role === "ADMIN") {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash: newPasswordHash },
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "User",
    entityId: target.id,
    details: { action: "password-reset", targetName: target.name, targetRole: target.role },
  });

  return NextResponse.json({ success: true });
}
