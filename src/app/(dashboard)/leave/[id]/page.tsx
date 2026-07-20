import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/formatDateInput";
import { canDelete } from "@/lib/authz";
import { DeleteButton } from "@/components/DeleteButton";
import { LeaveForm } from "../LeaveForm";

export default async function EditLeavePage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);

  const [leave, users] = await Promise.all([
    prisma.leave.findFirst({ where: { id: params.id, officeId: session!.user.officeId } }),
    prisma.user.findMany({
      where: { officeId: session!.user.officeId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!leave) notFound();

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">Edit leave record</h1>
      <LeaveForm
        mode="edit"
        id={leave.id}
        users={users}
        initialData={{
          dateFiled: toDateInputValue(leave.dateFiled),
          leaveStart: toDateInputValue(leave.leaveStart),
          leaveEnd: toDateInputValue(leave.leaveEnd),
          type: leave.type,
          personnelId: leave.personnelId,
          scannedCopyUrl: leave.scannedCopyUrl ?? "",
        }}
      />
      {canDelete(session!.user.role) && <DeleteButton endpoint={`/api/leave/${leave.id}`} redirectTo="/leave" />}
    </main>
  );
}
