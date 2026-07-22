import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/formatDateInput";
import { canDelete } from "@/lib/authz";
import { DeleteButton } from "@/components/DeleteButton";
import { OutgoingForm } from "../OutgoingForm";

export default async function EditOutgoingPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);

  const [doc, incomingDocs] = await Promise.all([
    prisma.outgoingDocument.findFirst({ where: { id: params.id, officeId: session!.user.officeId } }),
    prisma.incomingDocument.findMany({
      where: { officeId: session!.user.officeId },
      orderBy: { dateReceived: "desc" },
      select: { id: true, routingNumber: true, documentTitle: true },
    }),
  ]);

  if (!doc) notFound();

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">Edit outgoing document — {doc.routingNumber}</h1>
      <OutgoingForm
        mode="edit"
        id={doc.id}
        incomingDocs={incomingDocs}
        initialData={{
          dateReleased: toDateInputValue(doc.dateReleased),
          routingNumber: doc.routingNumber,
          documentTitle: doc.documentTitle,
          instructions: doc.instructions ?? "",
          receivedBy: doc.receivedBy ?? "",
          relatedIncomingId: doc.relatedIncomingId ?? "",
          progressRemarks: doc.progressRemarks ?? "",
          scannedCopyUrl: doc.scannedCopyUrl ?? "",
          filed: doc.filed,
        }}
      />
      {canDelete(session!.user.role) && <DeleteButton endpoint={`/api/outgoing/${doc.id}`} redirectTo="/outgoing" />}
    </main>
  );
}
