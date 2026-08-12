import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/formatDateInput";
import { canDelete } from "@/lib/authz";
import { formatMonthLabel, formatMonthParam, officeTracksDtr } from "@/lib/dtr";
import { DeleteButton } from "@/components/DeleteButton";
import { DtrForm } from "../DtrForm";

export default async function EditDtrPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  // Checked as well as the office scoping below. The two catch different things:
  // scoping stops one office opening another's record, this stops an office that
  // keeps no DTR register reaching the module at all.
  if (!(await officeTracksDtr(officeId))) notFound();

  const [record, users] = await Promise.all([
    prisma.dtrRecord.findFirst({
      where: { id: params.id, officeId },
      include: { personnel: { select: { name: true } } },
    }),
    prisma.user.findMany({
      where: { officeId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!record) notFound();

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">
        Edit DTR filing — {record.personnel.name}, {formatMonthLabel(record.periodMonth)}
      </h1>
      <DtrForm
        mode="edit"
        id={record.id}
        users={users}
        initialData={{
          periodMonth: formatMonthParam(record.periodMonth),
          dateReceived: toDateInputValue(record.dateReceived),
          dateFiled: toDateInputValue(record.dateFiled),
          dateSubmittedToHr: toDateInputValue(record.dateSubmittedToHr),
          personnelId: record.personnelId,
          submittedAndChecked: record.submittedAndChecked,
        }}
      />
      {canDelete(session!.user.role) && (
        <DeleteButton endpoint={`/api/dtr/${record.id}`} redirectTo="/dtr" />
      )}
    </main>
  );
}
