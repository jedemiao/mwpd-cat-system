import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/formatDateInput";
import { canDelete } from "@/lib/authz";
import { DeleteButton } from "@/components/DeleteButton";
import { getLinkableActivities } from "@/lib/linkableActivities";
import { OutgoingForm } from "../OutgoingForm";

export default async function EditOutgoingPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);

  const [doc, office] = await Promise.all([
    prisma.outgoingDocument.findFirst({
      where: { id: params.id, officeId: session!.user.officeId },
      include: { linkedActivities: { select: { activityId: true } } },
    }),
    prisma.office.findUnique({
      where: { id: session!.user.officeId },
      select: { detailedLedgerColumns: true },
    }),
  ]);

  if (!doc) notFound();

  const registerStyle = office?.detailedLedgerColumns ?? false;
  const linkedActivityIds = doc.linkedActivities.map((l) => l.activityId);
  const activities = registerStyle
    ? await getLinkableActivities(session!.user.officeId, linkedActivityIds)
    : [];

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">Edit outgoing document — {doc.routingNumber}</h1>
      <OutgoingForm
        mode="edit"
        id={doc.id}
        registerStyle={registerStyle}
        activities={activities}
        initialData={{
          dateReleased: toDateInputValue(doc.dateReleased),
          routingNumber: doc.routingNumber,
          documentTypeOther: doc.documentTypeOther ?? "",
          documentTitle: doc.documentTitle,
          instructions: doc.instructions ?? "",
          receivingOffice: doc.receivingOffice ?? "",
          receivedBy: doc.receivedBy ?? "",
          receivedDate: doc.receivedDate ? toDateInputValue(doc.receivedDate) : "",
          receivedTime: doc.receivedTime ?? "",
          progressRemarks: doc.progressRemarks ?? "",
          scannedCopyUrl: doc.scannedCopyUrl ?? "",
          filed: doc.filed,
          activityIds: linkedActivityIds,
        }}
      />
      {canDelete(session!.user.role) && <DeleteButton endpoint={`/api/outgoing/${doc.id}`} redirectTo="/outgoing" />}
    </main>
  );
}
