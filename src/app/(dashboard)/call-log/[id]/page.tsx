import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/formatDateInput";
import { canDelete } from "@/lib/authz";
import { officeTracksCallLog } from "@/lib/sena";
import { DeleteButton } from "@/components/DeleteButton";
import { CallLogForm } from "../CallLogForm";

export default async function EditCallLogPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  if (!(await officeTracksCallLog(officeId))) notFound();

  const call = await prisma.callLog.findFirst({ where: { id: params.id, officeId } });
  if (!call) notFound();

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">
        Edit call — {call.callerName}
      </h1>
      <CallLogForm
        mode="edit"
        id={call.id}
        initialData={{
          callDate: toDateInputValue(call.callDate),
          phoneNumber: call.phoneNumber,
          callerName: call.callerName,
          concern: call.concern,
          remarks: call.remarks ?? "",
        }}
      />
      {canDelete(session!.user.role) && (
        <DeleteButton endpoint={`/api/call-log/${call.id}`} redirectTo="/call-log" />
      )}
    </main>
  );
}
