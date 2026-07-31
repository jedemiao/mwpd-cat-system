import { NextRequest, NextResponse } from "next/server";
import { Prisma, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/authz";
import { passwordSchema } from "@/lib/passwordPolicy";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .regex(/^[a-zA-Z0-9._-]+$/, "Username may only contain letters, numbers, dots, dashes and underscores."),
  // Optional: a contact detail, not a login credential and not a notification
  // channel (there is no SMTP anywhere in this system).
  email: z.union([z.string().trim().email("Enter a valid email address."), z.literal("")]).optional(),
  role: z.nativeEnum(Role),
  password: passwordSchema,
});

// POST /api/users — create an account for this office.
//
// officeId comes from the session, never the request body: an account is
// always created inside the creator's own office.
export async function POST(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Check the details and try again.";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  const { name, username, email, role, password } = parsed.data;

  // Only an Admin may mint another Admin — a Chief creating one would be
  // privilege escalation, the same rule /api/account/reset-password applies.
  if (role === "ADMIN" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only an administrator can create an administrator account." }, { status: 403 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const created = await prisma.user.create({
      data: {
        officeId: session.user.officeId,
        name,
        username,
        email: email ? email : null,
        role,
        passwordHash,
      },
      select: { id: true, name: true, username: true, role: true },
    });

    await logAudit({
      ipAddress: getClientIp(req),
      officeId: session.user.officeId,
      userId: session.user.id,
      action: "CREATE",
      entityType: "User",
      entityId: created.id,
      // The password is never written to the audit trail, only the fact of creation.
      details: { name: created.name, username: created.username, role: created.role },
    });

    return NextResponse.json({ user: created }, { status: 201 });
  } catch (e) {
    // username is globally unique, so a clash can come from another office too —
    // report it as taken without revealing anything about the other account.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
    throw e;
  }
}
