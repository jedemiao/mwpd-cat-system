import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/formatDateInput";
import { canSignOffAsChief, canDelete } from "@/lib/authz";
import { getIncomingFormData } from "@/lib/incomingFormData";
import { DeleteButton } from "@/components/DeleteButton";
import { IncomingForm } from "../IncomingForm";
import { ReplyPanel } from "./ReplyPanel";

export default async function EditIncomingPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);

  const doc = await prisma.incomingDocument.findFirst({
    where: { id: params.id, officeId: session!.user.officeId },
    include: {
      routedTo: { select: { userId: true } },
      // Present only when this document was handed over by another division.
      // Read from the delivery rather than originAgency, which is free text a
      // clerk may have typed and cannot be trusted to name a real division.
      delivery: {
        select: {
          receivedAt: true,
          receivedBy: { select: { name: true } },
          outgoing: {
            select: { routingNumber: true, office: { select: { code: true, name: true } } },
          },
        },
      },
      // Ordered oldest first so a rare second reply reads after the first,
      // which is the order the -R2 suffix implies.
      outgoingReplies: {
        select: { id: true, routingNumber: true, documentTitle: true, status: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!doc) notFound();

  const { users, agencySuggestions, signatorySuggestions, splitIncomingLedgers, registerLayout, tracksArta } =
    await getIncomingFormData(session!.user.officeId);

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">Edit incoming document — {doc.routingNumber}</h1>

      {/* Provenance, stated once at the top rather than as a form field: it
          is a fact about how the document arrived, not something anybody
          should be able to edit here. */}
      {doc.delivery && (
        <div className="mb-4 rounded-md border border-info/40 bg-info/5 px-4 py-3 text-sm dark:border-info/30 dark:bg-info/10">
          <span className="font-medium text-ink-900 dark:text-white">
            Received from {doc.delivery.outgoing.office.name}
          </span>
          <span className="block text-xs text-ink-600 dark:text-white/50">
            Their reference {doc.delivery.outgoing.routingNumber ?? "—"}
            {doc.delivery.receivedBy && ` · filed by ${doc.delivery.receivedBy.name}`}
            {doc.delivery.receivedAt &&
              ` on ${doc.delivery.receivedAt.toLocaleDateString()}`}
          </span>
        </div>
      )}
      <IncomingForm
        mode="edit"
        id={doc.id}
        users={users}
        agencySuggestions={agencySuggestions}
        signatorySuggestions={signatorySuggestions}
        currentUserId={session!.user.id}
        canSignOff={canSignOffAsChief(session!.user.role)}
        splitIncomingLedgers={splitIncomingLedgers}
        registerLayout={registerLayout}
        tracksArta={tracksArta}
        initialData={{
          dateReceived: toDateInputValue(doc.dateReceived),
          timeReceived: doc.timeReceived ?? "",
          receivedById: doc.receivedById ?? "",
          origin: doc.origin,
          originAgency: doc.originAgency ?? "",
          signatory: doc.signatory ?? "",
          documentType: doc.documentType ?? undefined,
          documentTypeOther: doc.documentTypeOther ?? "",
          routingNumber: doc.routingNumber,
          documentTitle: doc.documentTitle,
          dueDate: toDateInputValue(doc.dueDate),
          routedToIds: doc.routedTo.map((r) => r.userId),
          instructions: doc.instructions ?? "",
          complexity: doc.complexity,
          progressRemarks: doc.progressRemarks ?? "",
          notes: doc.notes ?? "",
          dateCompleted: toDateInputValue(doc.dateCompleted),
          scannedCopyUrl: doc.scannedCopyUrl ?? "",
          filed: doc.filed,
        }}
      />
      <ReplyPanel incomingId={doc.id} replies={doc.outgoingReplies} routed={doc.routedTo.length > 0} />
      {canDelete(session!.user.role) && <DeleteButton endpoint={`/api/incoming/${doc.id}`} redirectTo="/incoming" />}
    </main>
  );
}
