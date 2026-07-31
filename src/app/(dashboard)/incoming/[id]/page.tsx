import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/formatDateInput";
import { canSignOffAsChief, canDelete } from "@/lib/authz";
import { getIncomingFormData } from "@/lib/incomingFormData";
import { DeleteButton } from "@/components/DeleteButton";
import { IncomingForm } from "../IncomingForm";

export default async function EditIncomingPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);

  const doc = await prisma.incomingDocument.findFirst({
    where: { id: params.id, officeId: session!.user.officeId },
    include: {
      routedTo: { select: { userId: true } },
      linkedActivities: { select: { activityId: true } },
    },
  });

  if (!doc) notFound();

  // Fetched after the document so already-linked activities can be merged into
  // the picker even when they fall outside the recent window.
  const { users, activities, agencySuggestions, signatorySuggestions } = await getIncomingFormData(
    session!.user.officeId,
    doc.linkedActivities.map((l) => l.activityId),
  );

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">Edit incoming document — {doc.routingNumber}</h1>
      <IncomingForm
        mode="edit"
        id={doc.id}
        users={users}
        activities={activities}
        agencySuggestions={agencySuggestions}
        signatorySuggestions={signatorySuggestions}
        currentUserId={session!.user.id}
        canSignOff={canSignOffAsChief(session!.user.role)}
        initialData={{
          dateReceived: toDateInputValue(doc.dateReceived),
          timeReceived: doc.timeReceived ?? "",
          receivedById: doc.receivedById ?? "",
          origin: doc.origin,
          originAgency: doc.originAgency ?? "",
          signatory: doc.signatory ?? "",
          documentType: doc.documentType ?? undefined,
          routingNumber: doc.routingNumber,
          documentTitle: doc.documentTitle,
          routedToIds: doc.routedTo.map((r) => r.userId),
          activityIds: doc.linkedActivities.map((l) => l.activityId),
          instructions: doc.instructions ?? "",
          complexity: doc.complexity,
          numCorrections: doc.numCorrections,
          progressRemarks: doc.progressRemarks ?? "",
          notes: doc.notes ?? "",
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
