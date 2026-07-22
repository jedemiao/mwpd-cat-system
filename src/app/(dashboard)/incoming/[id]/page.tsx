import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/formatDateInput";
import { canSignOffAsChief, canDelete } from "@/lib/authz";
import { DeleteButton } from "@/components/DeleteButton";
import { IncomingForm } from "../IncomingForm";

export default async function EditIncomingPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);

  const [doc, users] = await Promise.all([
    prisma.incomingDocument.findFirst({
      where: { id: params.id, officeId: session!.user.officeId },
      include: { routedTo: { select: { userId: true } } },
    }),
    prisma.user.findMany({
      where: { officeId: session!.user.officeId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!doc) notFound();

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">Edit incoming document — {doc.routingNumber}</h1>
      <IncomingForm
        mode="edit"
        id={doc.id}
        users={users}
        canSignOff={canSignOffAsChief(session!.user.role)}
        initialData={{
          dateReceived: toDateInputValue(doc.dateReceived),
          routingNumber: doc.routingNumber,
          documentTitle: doc.documentTitle,
          routedToIds: doc.routedTo.map((r) => r.userId),
          instructions: doc.instructions ?? "",
          complexity: doc.complexity,
          numCorrections: doc.numCorrections,
          progressRemarks: doc.progressRemarks ?? "",
          dateCompleted: toDateInputValue(doc.dateCompleted),
          dcSignOffDate: toDateInputValue(doc.dcSignOffDate),
          scannedCopyUrl: doc.scannedCopyUrl ?? "",
          filed: doc.filed,
        }}
      />
      {canDelete(session!.user.role) && <DeleteButton endpoint={`/api/incoming/${doc.id}`} redirectTo="/incoming" />}
    </main>
  );
}
