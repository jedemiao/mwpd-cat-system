import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit, getClientIp } from "@/lib/auditLog";
import { ACTIVITY_CATEGORIES } from "@/lib/activityCategories";
import { z } from "zod";

const createSchema = z.object({
  date: z.string(), // ISO date string from the client — start date
  endDate: z.string().optional(), // set only for multi-day activities; must be >= date
  activityName: z.string(),
  // ON_LEAVE is not one of these values and must never become one: leave lives
  // in the Leave table and is only projected onto the calendar.
  category: z.enum(ACTIVITY_CATEGORIES).optional(),
  categoryOther: z.string().trim().min(1).optional(), // only kept when category is OTHERS
  location: z.string().optional(),
  remarks: z.string().optional(),
  officeOrderUrl: z.string().optional(),
  memoUrl: z.string().optional(),
  inspectionReportUrl: z.string().optional(),
  assigneeIds: z.array(z.string()).min(1),
});

// GET /api/activities — list activities for the logged-in user's office, newest first
export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const activities = await prisma.activity.findMany({
    where: { officeId: session.user.officeId },
    orderBy: { date: "desc" },
    include: { assignees: { include: { user: { select: { name: true } } } } },
  });

  return NextResponse.json(activities);
}

// POST /api/activities — create an activity with one or more people in charge
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

  const { date, endDate, assigneeIds, ...rest } = parsed.data;

  const uniqueAssigneeIds = [...new Set(assigneeIds)];
  const validAssignees = await prisma.user.count({
    where: { id: { in: uniqueAssigneeIds }, officeId: session.user.officeId },
  });
  if (validAssignees !== uniqueAssigneeIds.length) {
    return NextResponse.json({ error: "Invalid assigneeIds" }, { status: 400 });
  }

  const startDate = new Date(date);
  const parsedEndDate = endDate ? new Date(endDate) : null;
  if (parsedEndDate && parsedEndDate < startDate) {
    return NextResponse.json({ error: "End date can't be before the start date" }, { status: 400 });
  }

  const activity = await prisma.activity.create({
    data: {
      ...rest,
      // The specification belongs to OTHERS alone — a category change must not
      // leave a stale "Team building" hanging off a Job Fair.
      categoryOther: (rest.category ?? "OTHERS") === "OTHERS" ? rest.categoryOther : null,
      officeId: session.user.officeId,
      date: startDate,
      endDate: parsedEndDate,
      assignees: { create: assigneeIds.map((userId) => ({ userId })) },
    },
    include: { assignees: { include: { user: { select: { name: true } } } } },
  });

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "CREATE",
    entityType: "Activity",
    entityId: activity.id,
    details: parsed.data,
  });

  return NextResponse.json(activity, { status: 201 });
}
