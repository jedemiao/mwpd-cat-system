import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/formatDateInput";
import { canDelete } from "@/lib/authz";
import { DeleteButton } from "@/components/DeleteButton";
import { ActivityForm } from "../ActivityForm";

export default async function EditActivityPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);

  const [activity, users] = await Promise.all([
    prisma.activity.findFirst({
      where: { id: params.id, officeId: session!.user.officeId },
      include: { assignees: { select: { userId: true } } },
    }),
    prisma.user.findMany({
      where: { officeId: session!.user.officeId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!activity) notFound();

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">Edit activity — {activity.activityName}</h1>
      <ActivityForm
        mode="edit"
        id={activity.id}
        users={users}
        initialData={{
          date: toDateInputValue(activity.date),
          endDate: toDateInputValue(activity.endDate),
          activityName: activity.activityName,
          remarks: activity.remarks ?? "",
          officeOrderUrl: activity.officeOrderUrl ?? "",
          memoUrl: activity.memoUrl ?? "",
          inspectionReportUrl: activity.inspectionReportUrl ?? "",
          assigneeIds: activity.assignees.map((a) => a.userId),
        }}
      />
      {canDelete(session!.user.role) && (
        <DeleteButton endpoint={`/api/activities/${activity.id}`} redirectTo="/activities" />
      )}
    </main>
  );
}
